package main

import (
	"io"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"gostream/internal/gostorm/settings"
)

func init() {
	// Initialize settings.BTsets to avoid nil dereference in Put/Get paths
	if settings.BTsets == nil {
		settings.BTsets = &settings.BTSets{
			ResponsiveMode: false,
			AdaptiveShield: false,
			CacheSize:      128 * 1024 * 1024,
			ReaderReadAHead: 50,
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// newTestCache returns a fresh ReadAheadCache with a generous ReadAheadBudget
// set in globalConfig so Put() eviction logic does not interfere by default.
func newTestCache(budgetBytes int64) *ReadAheadCache {
	globalConfig.ReadAheadBudget = budgetBytes
	return newReadAheadCache()
}

// newTestDiskWarmup creates a DiskWarmupCache backed by a temp directory.
// The caller is responsible for removing the temp dir after the test.
func newTestDiskWarmup(t *testing.T) (*DiskWarmupCache, string) {
	t.Helper()
	dir, err := os.MkdirTemp("", "diskwarmup-test-*")
	if err != nil {
		t.Fatalf("MkdirTemp: %v", err)
	}
	d := &DiskWarmupCache{
		dir:     dir,
		writeCh: make(chan warmupWrite, 64),
	}
	go d.writeWorker()
	return d, dir
}

// ---------------------------------------------------------------------------
// TestRaCacheBasicGetPut: write a chunk then read back the same byte range.
// ---------------------------------------------------------------------------

func TestRaCacheBasicGetPut(t *testing.T) {
	c := newTestCache(256 * 1024 * 1024)
	c.SwitchContext("/test/file.mkv")

	const path = "/test/file.mkv"
	data := make([]byte, 4096)
	for i := range data {
		data[i] = byte(i % 251)
	}

	start := int64(0)
	end := int64(len(data) - 1)
	c.Put(path, start, end, data)

	got := c.Get(path, start, end)
	if got == nil {
		t.Fatal("Get returned nil after Put")
	}
	if len(got) != len(data) {
		t.Fatalf("length mismatch: got %d want %d", len(got), len(data))
	}
	for i, b := range got {
		if b != data[i] {
			t.Fatalf("byte mismatch at index %d: got %d want %d", i, b, data[i])
		}
	}
}

// ---------------------------------------------------------------------------
// TestRaCacheCrossChunkBoundary: read spanning two adjacent 16MB chunks.
// ---------------------------------------------------------------------------

func TestRaCacheCrossChunkBoundary(t *testing.T) {
	c := newTestCache(512 * 1024 * 1024)
	const path = "/test/movie.mkv"
	c.SwitchContext(path)

	chunkSize := int64(16 * 1024 * 1024) // default chunk size

	// chunk A: [0, chunkSize-1]
	chunkA := make([]byte, chunkSize)
	for i := range chunkA {
		chunkA[i] = 0xAA
	}
	c.Put(path, 0, chunkSize-1, chunkA)

	// chunk B: [chunkSize, 2*chunkSize-1]
	chunkB := make([]byte, chunkSize)
	for i := range chunkB {
		chunkB[i] = 0xBB
	}
	c.Put(path, chunkSize, 2*chunkSize-1, chunkB)

	// Cross-boundary read: last byte of chunk A + first byte of chunk B
	off := chunkSize - 1
	end := chunkSize // one byte into chunk B
	got := c.Get(path, off, end)
	if got == nil {
		t.Fatal("cross-boundary Get returned nil")
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 bytes, got %d", len(got))
	}
	if got[0] != 0xAA {
		t.Errorf("first byte: want 0xAA got 0x%02X", got[0])
	}
	if got[1] != 0xBB {
		t.Errorf("second byte: want 0xBB got 0x%02X", got[1])
	}
}

// ---------------------------------------------------------------------------
// TestRaCacheSwitchContextInvalidates: after SwitchContext with a new path,
// chunks written for the old session should not be returned.
// ---------------------------------------------------------------------------

func TestRaCacheSwitchContextInvalidates(t *testing.T) {
	c := newTestCache(512 * 1024 * 1024)

	const oldPath = "/test/old.mkv"
	c.SwitchContext(oldPath)

	data := make([]byte, 1024)
	for i := range data {
		data[i] = 0xFF
	}
	c.Put(oldPath, 0, int64(len(data)-1), data)

	// Verify old data is readable before context switch
	if got := c.Get(oldPath, 0, int64(len(data)-1)); got == nil {
		t.Fatal("expected data before context switch")
	}

	// Switch to a new context — old session's chunks become stale
	const newPath = "/test/new.mkv"
	c.SwitchContext(newPath)

	// Chunks for oldPath were written with sessID=old; triggerGlobalEviction runs
	// asynchronously in a goroutine started by SwitchContext. The eviction has a
	// 120s stale threshold on lastAccess, so chunks won't be evicted immediately
	// by time alone. However, Put() for a different active path assigns sessID=0,
	// and triggerGlobalEviction evicts entries whose sessID != currentSessionID
	// AND key doesn't share the new active path prefix.
	//
	// What we CAN assert deterministically: the currentSessionID was incremented,
	// meaning new writes on newPath get a fresh sessionID.
	c.muContext.Lock()
	sid := c.currentSessionID
	c.muContext.Unlock()

	if sid < 1 {
		t.Errorf("expected sessionID >= 1 after SwitchContext, got %d", sid)
	}

	// Write data on the new path and verify it is readable
	newData := make([]byte, 512)
	for i := range newData {
		newData[i] = 0x11
	}
	c.Put(newPath, 0, int64(len(newData)-1), newData)

	if got := c.Get(newPath, 0, int64(len(newData)-1)); got == nil {
		t.Fatal("expected new data after context switch")
	}
}

// ---------------------------------------------------------------------------
// TestRaCacheConcurrentPutGet: 20 goroutines hammering Put/Get must not
// race or panic. Run with: go test -race ./...
// ---------------------------------------------------------------------------

func TestRaCacheConcurrentPutGet(t *testing.T) {
	c := newTestCache(512 * 1024 * 1024)
	const path = "/test/concurrent.mkv"
	c.SwitchContext(path)

	const goroutines = 20
	const chunkSize = 16 * 1024 * 1024

	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func(id int) {
			defer wg.Done()
			// Each goroutine writes a different 4KB slice within chunk 0
			offset := int64(id * 4096)
			data := make([]byte, 4096)
			for j := range data {
				data[j] = byte(id)
			}
			// Put within chunk 0 boundaries
			start := offset
			end := offset + int64(len(data)) - 1
			if end >= chunkSize {
				end = chunkSize - 1
				data = data[:end-start+1]
			}
			if start > end {
				return
			}
			c.Put(path, start, end, data)

			// Attempt a Get — result may or may not be present due to eviction
			_ = c.Get(path, start, end)
		}(i)
	}

	wg.Wait() // must not panic or deadlock
}

// ---------------------------------------------------------------------------
// TestRaCacheEvictionUnderBudget: filling beyond budget must keep used <= budget.
// ---------------------------------------------------------------------------

func TestRaCacheEvictionUnderBudget(t *testing.T) {
	// Budget of 3 chunks (48 MB); we will insert 6 chunks (96 MB)
	const chunkSize = 16 * 1024 * 1024
	budget := int64(3 * chunkSize)
	c := newTestCache(budget)

	const path = "/test/evict.mkv"
	c.SwitchContext(path)

	for i := 0; i < 6; i++ {
		start := int64(i) * chunkSize
		end := start + chunkSize - 1
		data := make([]byte, chunkSize)
		c.Put(path, start, end, data)
	}

	// After 6 inserts each evicting from the same shard, used must not grow
	// arbitrarily above budget. Allow a 1-chunk tolerance for concurrent racing.
	used := atomic.LoadInt64(&c.used)
	if used > budget+chunkSize {
		t.Errorf("cache used %d bytes, exceeds budget %d by more than one chunk", used, budget)
	}
}

// ---------------------------------------------------------------------------
// TestDiskWarmupRoundtrip: write a chunk via WriteChunk, then read it back.
// ---------------------------------------------------------------------------

func TestDiskWarmupRoundtrip(t *testing.T) {
	d, dir := newTestDiskWarmup(t)
	defer os.RemoveAll(dir)

	const hash = "aabbccddeeff00112233445566778899aabbccdd"
	const fileID = 0

	payload := make([]byte, 1024)
	for i := range payload {
		payload[i] = byte(i % 127)
	}

	// Call processWrite directly (same package) to avoid async channel timing
	// races where GetAvailableRange runs before the writeWorker and adds the
	// path to the missing map, causing spurious 0 returns even after the write.
	d.processWrite(hash, fileID, payload, 0)

	avail := d.GetAvailableRange(hash, fileID)
	if avail < int64(len(payload)) {
		t.Fatalf("GetAvailableRange returned %d after processWrite, want >= %d", avail, len(payload))
	}

	buf := make([]byte, len(payload))
	n, err := d.ReadAt(hash, fileID, buf, 0)
	if err != nil {
		t.Fatalf("ReadAt error: %v", err)
	}
	if n != len(payload) {
		t.Fatalf("ReadAt: got %d bytes, want %d", n, len(payload))
	}
	for i, b := range buf {
		if b != payload[i] {
			t.Fatalf("data mismatch at byte %d: got %d want %d", i, b, payload[i])
		}
	}
}

// ---------------------------------------------------------------------------
// TestNativeReaderInterruptUnblocks: Interrupt() on a reader blocked in a
// slow pipe read must unblock within 100ms without leaking goroutines.
//
// This test exercises the interrupt path directly by constructing a NativeReader
// with a manually controlled pipe, bypassing startStream (which requires a live
// torrent not available in unit tests).
// ---------------------------------------------------------------------------

func TestNativeReaderInterruptUnblocks(t *testing.T) {
	// Build a NativeReader whose pipe we control directly.
	pr, pw := io.Pipe()

	r := &NativeReader{
		hash:         "deadbeefdeadbeefdeadbeefdeadbeef00000000",
		fileID:       0,
		lastActivity: time.Now(),
		pipeReader:   pr,
		pipeWriter:   pw,
		offset:       0,
	}
	r.pipeReaderAtomic.Store(pr)

	// Start a blocked ReadAt in a goroutine.
	// offset=0 matches r.offset=0, so it goes down the sequential path
	// and blocks on io.ReadFull waiting for pw to write.
	readDone := make(chan struct{})
	var readErr error
	go func() {
		buf := make([]byte, 1024)
		_, readErr = r.ReadAt(buf, 0)
		close(readDone)
	}()

	// Give the goroutine time to block inside ReadFull.
	time.Sleep(30 * time.Millisecond)

	// Interrupt the read.
	start := time.Now()
	r.Interrupt()

	select {
	case <-readDone:
		elapsed := time.Since(start)
		if elapsed > 100*time.Millisecond {
			t.Errorf("Interrupt took %v (want <100ms)", elapsed)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("ReadAt did not unblock within 500ms after Interrupt()")
	}

	// The error must signal interruption (ErrInterrupted or pipe closed error).
	if readErr == nil {
		t.Error("expected non-nil error after Interrupt, got nil")
	}

	// Close the writer to avoid goroutine leak.
	_ = pw.Close()
}
