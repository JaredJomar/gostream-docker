package main

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// Test 1: TestMasterSemaphoreExhaustion
// Verify that a full semaphore channel rejects additional acquires within a
// bounded timeout instead of blocking forever.
// ---------------------------------------------------------------------------

func TestMasterSemaphoreExhaustion(t *testing.T) {
	const cap = 5
	sem := make(chan struct{}, cap)

	// Fill all slots
	for i := 0; i < cap; i++ {
		sem <- struct{}{}
	}

	// Trying to acquire one more slot must fail within 100ms
	acquired := make(chan bool, 1)
	go func() {
		select {
		case sem <- struct{}{}:
			acquired <- true
		case <-time.After(100 * time.Millisecond):
			acquired <- false
		}
	}()

	select {
	case ok := <-acquired:
		if ok {
			t.Error("expected semaphore acquire to fail when full, but it succeeded")
		}
	case <-time.After(500 * time.Millisecond):
		t.Error("goroutine did not return within deadline")
	}
}

// ---------------------------------------------------------------------------
// Test 2: TestSemaphoreNoSlotLeak
// Acquire + release 1000 times concurrently; the channel must return to its
// original capacity afterwards.
// ---------------------------------------------------------------------------

func TestSemaphoreNoSlotLeak(t *testing.T) {
	const cap = 10
	const iterations = 1000
	sem := make(chan struct{}, cap)

	var wg sync.WaitGroup
	for i := 0; i < iterations; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// acquire
			sem <- struct{}{}
			// tiny critical section
			runtime_noop()
			// release
			<-sem
		}()
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("goroutines did not finish within 5s")
	}

	// After all goroutines done the channel must be empty (cap slots available)
	if len(sem) != 0 {
		t.Errorf("semaphore leaked: len=%d want 0", len(sem))
	}
}

// runtime_noop is a trivial no-op that prevents the compiler from optimising
// away the critical section in TestSemaphoreNoSlotLeak.
func runtime_noop() { time.Sleep(0) }

// ---------------------------------------------------------------------------
// Test 3: TestPumpRefCountConcurrentRelease
// 10 goroutines each decrement refCount once; the counter must never go below
// zero and cancel() must be called exactly once.
// ---------------------------------------------------------------------------

func TestPumpRefCountConcurrentRelease(t *testing.T) {
	var refCount int32 = 10
	var cancelCount int32

	cancelFn := func() {
		atomic.AddInt32(&cancelCount, 1)
	}

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			newRefs := atomic.AddInt32(&refCount, -1)
			if newRefs < 0 {
				t.Errorf("refCount went negative: %d", newRefs)
			}
			if newRefs == 0 {
				cancelFn()
			}
		}()
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("goroutines did not finish within 3s")
	}

	finalRef := atomic.LoadInt32(&refCount)
	if finalRef != 0 {
		t.Errorf("expected refCount=0 after all releases, got %d", finalRef)
	}
	if got := atomic.LoadInt32(&cancelCount); got != 1 {
		t.Errorf("cancel() called %d times, want exactly 1", got)
	}
}

// ---------------------------------------------------------------------------
// Test 4: TestGracePeriodFiresOnce
// Simulate a NativePumpState with refCount=1.  Two rapid Release() calls
// (both see refCount<=0) must still trigger the grace-period callback only
// once — modelled by an AfterFunc that fires at most once per state instance.
// ---------------------------------------------------------------------------

func TestGracePeriodFiresOnce(t *testing.T) {
	// Minimal stand-in for NativePumpState fields used in grace logic.
	type pumpState struct {
		refCount  int32
		cancelled int32
		once      sync.Once
	}

	ps := &pumpState{refCount: 1}

	ctx, realCancel := context.WithCancel(context.Background())

	graceCancel := func() {
		ps.once.Do(func() {
			atomic.AddInt32(&ps.cancelled, 1)
			realCancel()
		})
	}

	release := func() {
		newRefs := atomic.AddInt32(&ps.refCount, -1)
		if newRefs <= 0 {
			// Mimic time.AfterFunc grace period (shortened to 50ms for test speed)
			time.AfterFunc(50*time.Millisecond, graceCancel)
		}
	}

	// First release: refCount goes to 0 → schedules grace timer
	release()
	// Second release (e.g. race between two handles): refCount goes to -1 → also
	// schedules another timer, but sync.Once guarantees cancel fires exactly once.
	release()

	// Wait for grace timers to expire
	select {
	case <-ctx.Done():
	case <-time.After(500 * time.Millisecond):
		t.Fatal("grace period callback never fired")
	}

	if got := atomic.LoadInt32(&ps.cancelled); got != 1 {
		t.Errorf("grace callback fired %d times, want exactly 1", got)
	}
}
