"""Velog 이미지를 내려받아 GitHub에 올리고, 마크다운 내 링크를 jsDelivr CDN으로 바꾼다.

이 스크립트는 config.GH_REPO 저장소와 연결된 git 작업 트리에서 실행하거나,
ASSETS_DIR을 해당 저장소 아래에 두고 push 할 수 있는 상태에서 실행한다.
"""
import hashlib
import re
import subprocess
from pathlib import Path

import requests

import config

MARKDOWN_IMG = re.compile(r'!\[([^\]]*)\]\((https://velog\.velcdn\.com/[^)\s]+)\)')
HTML_IMG = re.compile(r'(<img[^>]+src=")(https://velog\.velcdn\.com/[^"]+)(")')

EXPORT = Path(config.EXPORT_DIR)
ASSETS = Path(config.ASSETS_DIR)


def download(url):
    ext = url.split("?")[0].rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "gif", "webp"):
        ext = "png"
    name = hashlib.md5(url.encode()).hexdigest()[:16] + "." + ext
    dst = ASSETS / name
    if not dst.exists():
        res = requests.get(url, timeout=60)
        res.raise_for_status()
        dst.write_bytes(res.content)
    return name


def cdn_url(name):
    return (f"https://cdn.jsdelivr.net/gh/{config.GH_USER}/{config.GH_REPO}"
            f"@{config.GH_BRANCH}/{config.ASSETS_DIR}/{name}")


def rewrite():
    ASSETS.mkdir(exist_ok=True)
    count = 0
    for md in EXPORT.glob("*.md"):
        text = md.read_text(encoding="utf-8")

        def replace_md(m):
            nonlocal count
            count += 1
            return f"![{m.group(1)}]({cdn_url(download(m.group(2)))})"

        def replace_html(m):
            nonlocal count
            count += 1
            return f"{m.group(1)}{cdn_url(download(m.group(2)))}{m.group(3)}"

        text = MARKDOWN_IMG.sub(replace_md, text)
        text = HTML_IMG.sub(replace_html, text)
        md.write_text(text, encoding="utf-8")
    print(f"rewrote {count} image links")


def push():
    for args in (["add", config.ASSETS_DIR],
                 ["commit", "-m", "add rehosted images"],
                 ["push"]):
        subprocess.run(["git", *args], check=False)


if __name__ == "__main__":
    rewrite()
    push()
