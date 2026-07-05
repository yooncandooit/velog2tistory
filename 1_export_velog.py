"""Velog GraphQL API로 전체 글을 마크다운으로 추출한다."""
import json
import time
from pathlib import Path

import requests

import config

QUERY = """
query Posts($username: String!, $cursor: ID, $limit: Int) {
  posts(username: $username, cursor: $cursor, limit: $limit) {
    id title body url_slug tags released_at
  }
}
"""


def fetch(endpoint, cursor):
    res = requests.post(
        endpoint,
        json={"query": QUERY, "variables": {
            "username": config.VELOG_USERNAME, "cursor": cursor, "limit": 50}},
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()
    if data.get("errors"):
        raise RuntimeError(data["errors"])
    return data["data"]["posts"]


def resolve_endpoint():
    """기본 엔드포인트가 실패하면 v3로 대체한다."""
    for endpoint in (config.VELOG_GRAPHQL, "https://v3.velog.io/graphql"):
        try:
            fetch(endpoint, None)
            return endpoint
        except Exception:
            continue
    raise SystemExit("Velog GraphQL 엔드포인트에 접근할 수 없습니다. config.py를 확인하세요.")


def to_frontmatter(post):
    title = (post["title"] or "").replace('"', "'")
    return "\n".join([
        "---",
        f'title: "{title}"',
        f'date: {post["released_at"]}',
        f'tags: {json.dumps(post["tags"], ensure_ascii=False)}',
        f'velog_slug: {post["url_slug"]}',
        "---", "",
    ])


def main():
    out = Path(config.EXPORT_DIR)
    out.mkdir(exist_ok=True)
    endpoint = resolve_endpoint()

    cursor, total = None, 0
    while True:
        posts = fetch(endpoint, cursor)
        if not posts:
            break
        for post in posts:
            (out / f'{post["url_slug"]}.md').write_text(
                to_frontmatter(post) + (post["body"] or ""), encoding="utf-8")
            total += 1
        cursor = posts[-1]["id"]
        print(f"exported {total} posts...")
        time.sleep(0.3)

    print(f"done: {total} posts -> {out.resolve()}")


if __name__ == "__main__":
    main()
