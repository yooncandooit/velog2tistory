"""저장된 세션으로 Tistory 에디터를 열어 마크다운 글을 발행한다.

이미지는 2단계에서 CDN 링크로 치환되어 있다고 가정한다.
글은 프런트매터 date 기준 오름차순(오래된 글 -> 최근 글)으로 발행한다.

    python 4_publish_tistory.py --limit 1              # 첫 글만 테스트
    python 4_publish_tistory.py --confirm              # 글마다 발행 전 확인
    python 4_publish_tistory.py --start 5 --limit 10   # 6번째부터 10개
"""
import argparse
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

import config

STATE_FILE = "tistory_state.json"
NEWPOST_URL = f"https://{config.TISTORY_BLOG}.tistory.com/manage/newpost/"
MARKDOWN_CM = ".CodeMirror.cm-s-tistory-markdown"


def parse_markdown(text):
    title, date, body = "제목없음", "", text
    if text.startswith("---"):
        _, front, body = text.split("---", 2)
        for line in front.splitlines():
            line = line.strip()
            if line.startswith("title:"):
                title = line.split(":", 1)[1].strip().strip('"').strip("'")
            elif line.startswith("date:"):
                date = line.split(":", 1)[1].strip()
    return title, date, body.strip()


def switch_to_markdown(page):
    """마크다운 모드로 전환. 전환 확인은 네이티브 confirm 다이얼로그라 accept 한다."""
    page.once("dialog", lambda d: d.accept())
    page.get_by_label("기본모드").get_by_role("button", name="기본모드").click()
    page.get_by_role("menuitem", name="마크다운").click()
    page.wait_for_timeout(1000)


def fill_body(page, body):
    """실제 키보드 입력으로 본문을 채운다.

    setValue 같은 프로그래밍 주입은 Tistory의 변경 감지를 건드리지 않아
    발행 시 본문이 비어버린다. 실제 입력이라야 저장 필드까지 동기화된다.
    """
    page.locator(f"{MARKDOWN_CM} .CodeMirror-lines").first.click()
    page.keyboard.insert_text(body)
    page.wait_for_timeout(300)


def body_length(page):
    return page.evaluate(
        """(sel) => {
            const el = document.querySelector(sel);
            return (el && el.CodeMirror) ? el.CodeMirror.getValue().length : 0;
        }""",
        MARKDOWN_CM,
    )


def publish_one(page, title, body, confirm):
    page.goto(NEWPOST_URL)
    page.wait_for_load_state("networkidle")

    for label in ("취소", "닫기"):
        try:
            page.get_by_role("button", name=label).click(timeout=1500)
        except Exception:
            pass

    switch_to_markdown(page)
    page.get_by_role("textbox", name="제목을 입력하세요").fill(title)
    fill_body(page, body)

    length = body_length(page)
    print(f"  body length: {length}")
    if length < 5:
        print("  skip: body appears empty")
        return

    if confirm:
        input(f'  publish "{title}"? Enter to continue, Ctrl+C to stop: ')

    page.get_by_role("button", name="완료").click()
    time.sleep(1)
    page.get_by_role("button", name="공개 발행").click()
    time.sleep(3)


def load_files():
    files = list(Path(config.EXPORT_DIR).glob("*.md"))
    files.sort(key=lambda p: parse_markdown(p.read_text(encoding="utf-8"))[1])
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()

    files = load_files()[args.start:]
    if args.limit:
        files = files[:args.limit]
    if not files:
        raise SystemExit("발행할 글이 없습니다. 1단계를 먼저 실행하세요.")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=config.HEADLESS)
        context = browser.new_context(storage_state=STATE_FILE)
        page = context.new_page()
        for i, md in enumerate(files, start=1):
            title, _, body = parse_markdown(md.read_text(encoding="utf-8"))
            print(f"[{i}/{len(files)}] {title}")
            try:
                publish_one(page, title, body, args.confirm)
                print("  published")
            except Exception as e:
                print(f"  failed: {e}")
            time.sleep(config.PUBLISH_DELAY_SEC)
        browser.close()


if __name__ == "__main__":
    main()
