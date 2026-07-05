"""Tistory 로그인 세션을 저장한다. 최초 1회만 실행한다."""
from playwright.sync_api import sync_playwright

STATE_FILE = "tistory_state.json"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto("https://www.tistory.com/auth/login")
        input("브라우저에서 로그인을 마친 뒤 Enter를 누르세요: ")
        page.context.storage_state(path=STATE_FILE)
        print(f"세션 저장 완료: {STATE_FILE}")
        browser.close()


if __name__ == "__main__":
    main()
