#!/usr/bin/env python3
"""Production smoke tests for Bonimbait."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
import urllib.error


class SmokeTest:
    """Simple smoke test runner using only stdlib."""

    def __init__(self, api_url: str, web_url: str) -> None:
        self.api_url = api_url.rstrip("/")
        self.web_url = web_url.rstrip("/")
        self.results: list[tuple[str, bool, str]] = []

    def _request(self, url: str, timeout: int = 10) -> tuple[int, str]:
        """Make an HTTP GET request and return (status_code, body)."""
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "bonimbait-smoke-test"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            return e.code, str(e)
        except Exception as e:
            return 0, str(e)

    def check(self, name: str, passed: bool, detail: str = "") -> None:
        self.results.append((name, passed, detail))
        status = "PASS" if passed else "FAIL"
        msg = f"  [{status}] {name}"
        if detail and not passed:
            msg += f" - {detail}"
        print(msg)

    def run(self) -> bool:
        print(f"\nSmoke Tests")
        print(f"  API: {self.api_url}")
        print(f"  Web: {self.web_url}")
        print("-" * 50)

        # Test 1: API health endpoint
        status, body = self._request(f"{self.api_url}/health")
        self.check("API /health", status == 200, f"status={status}")

        # Test 2: Categories endpoint returns data
        status, body = self._request(f"{self.api_url}/api/categories")
        has_data = False
        if status == 200:
            try:
                data = json.loads(body)
                has_data = isinstance(data, list) and len(data) > 0
            except json.JSONDecodeError:
                pass
        self.check("API /api/categories returns data", status == 200 and has_data,
                    f"status={status}, has_data={has_data}")

        # Test 3: Videos endpoint returns data
        status, body = self._request(f"{self.api_url}/api/videos")
        has_data = False
        if status == 200:
            try:
                data = json.loads(body)
                # Could be a list or a dict with items
                if isinstance(data, list):
                    has_data = len(data) > 0
                elif isinstance(data, dict):
                    has_data = len(data.get("items", data.get("videos", []))) > 0
            except json.JSONDecodeError:
                pass
        self.check("API /api/videos returns data", status == 200 and has_data,
                    f"status={status}, has_data={has_data}")

        # Test 4: Search endpoint
        status, body = self._request(f"{self.api_url}/api/search?q=בנייה")
        self.check("API /api/search responds", status == 200, f"status={status}")

        # Test 5: Answer endpoint
        status, body = self._request(f"{self.api_url}/api/answer?q=מה העלות של בנייה")
        self.check("API /api/answer responds", status in (200, 422), f"status={status}")

        # Test 6: Frontend homepage
        status, body = self._request(self.web_url)
        self.check("Frontend homepage loads", status == 200, f"status={status}")

        # Summary
        print("-" * 50)
        passed = sum(1 for _, p, _ in self.results if p)
        total = len(self.results)
        print(f"Results: {passed}/{total} passed")

        return passed == total


def main() -> None:
    parser = argparse.ArgumentParser(description="Bonimbait production smoke tests")
    parser.add_argument(
        "--api-url",
        default="https://bonimbait-api.fly.dev",
        help="API base URL",
    )
    parser.add_argument(
        "--web-url",
        default="https://bonimbait.com",
        help="Frontend base URL",
    )
    args = parser.parse_args()

    runner = SmokeTest(args.api_url, args.web_url)
    success = runner.run()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
