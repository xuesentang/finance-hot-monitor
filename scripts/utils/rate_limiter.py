"""频率控制 — 令牌桶实现"""

import time
import threading


class RateLimiter:
    """简单的令牌桶限速器，线程安全。"""

    def __init__(self, max_per_second: float):
        self.interval = 1.0 / max_per_second
        self._lock = threading.Lock()
        self._last = 0.0

    def wait(self) -> None:
        """阻塞直到允许下一次请求。"""
        with self._lock:
            now = time.monotonic()
            wait_time = self._last + self.interval - now
            if wait_time > 0:
                time.sleep(wait_time)
                self._last = time.monotonic()
            else:
                self._last = now
