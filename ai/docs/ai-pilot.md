# AI Pilot Overview

**AI Pilot** is an autonomous optimization engine designed for GoStream on Raspberry Pi 4. It uses a local LLM (Qwen2.5-0.5B) to dynamically tune BitTorrent parameters, ensuring a stable 4K streaming experience over Fiber connections while protecting the CPU from thermal stress.

## Core Architecture

1.  **AI Server**: A background service (`ai-server.service`) running `llama.cpp`. It hosts the quantized model and provides a local API on port `8085`. It is configured with low system priority (`Nice=15`) to ensure zero impact on video playback.
2.  **AI Tuner**: A background goroutine within GoStream that polls system metrics every 60 seconds. It calculates **30-second moving averages** for CPU usage and download speeds to provide the AI with a stable, noise-free context.

## Operational Logic

The AI acts as a "Pilot" that observes trends and makes real-time adjustments directly in RAM via the Native Bridge:
*   **Connections Limit**: Scaled between 15 and 60 peers based on buffer health and CPU load.
*   **Peer Timeout**: Adjusted between 10s and 60s to prioritize high-quality peers.

## Installation & Setup

To install and activate the AI components on the Raspberry Pi:

1.  **Prepare AI Directory**:
    ```bash
    rsync -avz GoStream/ai/ pi@192.168.1.2:/home/pi/GoStream/ai/
    ```

2.  **Run Setup Script**:
    ```bash
    ssh pi@192.168.1.2
    cd /home/pi/GoStream/ai
    chmod +x setup_pi.sh
    ./setup_pi.sh
    ```
    *The script handles dependencies, `llama.cpp` compilation (CMake), and model download.*

3.  **Install & Start Service**:
    ```bash
    sudo cp /home/pi/GoStream/ai/ai-server.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable ai-server
    sudo systemctl start ai-server
    ```

## Fail-Safe Design

If the AI Server is unreachable or disabled, GoStream automatically falls back to the default settings. The streaming pipeline is entirely decoupled from the AI logic, ensuring that any AI communication delay never causes playback stuttering.

## Key Files
*   Logic: `GoStream/ai/ai_tuner.go`
*   Setup: `GoStream/ai/setup_pi.sh`
*   Service: `GoStream/ai/ai-server.service`
