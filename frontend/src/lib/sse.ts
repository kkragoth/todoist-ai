// Minimal SSE framing: split `data: {...}` frames separated by blank lines
// and yield parsed JSON payloads. Malformed frames are skipped.

export async function* readSseRaw(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let sep: number;
            while ((sep = buf.indexOf("\n\n")) >= 0) {
                const frame = buf.slice(0, sep);
                buf = buf.slice(sep + 2);
                for (const line of frame.split("\n")) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data:")) continue;
                    const payload = trimmed.slice(5).trim();
                    if (!payload) continue;
                    try {
                        const raw = JSON.parse(payload) as Record<string, unknown>;
                        yield raw;
                    } catch {
                        // skip malformed frame
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
