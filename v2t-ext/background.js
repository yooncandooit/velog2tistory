// background.js - velog fetch(단건/전체) + 이미지 fetch + main world 실행 + 큐/이력 저장

const VELOG_ENDPOINTS = [
  "https://v3.velog.io/graphql",
  "https://v2.velog.io/graphql",
];

async function graphql(query, variables) {
  let lastErr;
  for (const ep of VELOG_ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      const data = await res.json();
      if (data?.errors) {
        lastErr = new Error(JSON.stringify(data.errors));
        continue;
      }
      return data.data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("velog GraphQL 요청 실패");
}

async function fetchVelogPost(velogUrl) {
  const m = velogUrl.match(/velog\.io\/@([^/]+)\/([^/?#]+)/);
  if (!m) throw new Error("velog URL 파싱 실패");
  const data = await graphql(
    `
      query Post($username: String, $url_slug: String) {
        post(username: $username, url_slug: $url_slug) {
          title
          body
          url_slug
          released_at
        }
      }
    `,
    { username: m[1], url_slug: decodeURIComponent(m[2]) },
  );
  if (!data?.post) throw new Error("글을 찾지 못함");
  return data.post;
}

/** 전체 글 목록 (페이지네이션) - 본문까지 한 번에 가져와 큐에 그대로 담는다 */
async function fetchAllPosts(username) {
  const posts = [];
  let cursor = null;
  while (true) {
    const data = await graphql(
      `
        query Posts($username: String!, $cursor: ID, $limit: Int) {
          posts(username: $username, cursor: $cursor, limit: $limit) {
            title
            body
            url_slug
            released_at
          }
        }
      `,
      { username, cursor, limit: 50 },
    );
    const batch = data?.posts || [];
    if (batch.length === 0) break;
    posts.push(...batch);
    cursor = batch[batch.length - 1].id;
    if (!cursor) break; // id 없이 오면 무한루프 방지
  }
  posts.sort((a, b) => new Date(a.released_at) - new Date(b.released_at)); // 오래된 글 -> 최신
  return posts;
}

// ── main world 함수들 ────────────────────────────────────

function readBodyMainWorld() {
  const el = [
    ...document.querySelectorAll(".CodeMirror.cm-s-tistory-markdown"),
  ].find((e) => e.offsetParent !== null);
  if (!el || !el.CodeMirror)
    return { ok: false, error: "보이는 마크다운 CM 없음" };
  return { ok: true, value: el.CodeMirror.getValue() };
}

function injectBodyMainWorld(text) {
  const el = [
    ...document.querySelectorAll(".CodeMirror.cm-s-tistory-markdown"),
  ].find((e) => e.offsetParent !== null);
  if (!el || !el.CodeMirror)
    return { ok: false, error: "보이는 마크다운 CM 없음" };
  const cm = el.CodeMirror;
  const lastLine = cm.lastLine();
  cm.replaceRange(
    text,
    { line: 0, ch: 0 },
    { line: lastLine, ch: cm.getLine(lastLine).length },
    "+input",
  );
  cm.setCursor({ line: 0, ch: 0 });
  cm.refresh();
  cm.focus();
  return { ok: true, length: cm.getValue().length };
}

function refreshBodyMainWorld() {
  const el = [
    ...document.querySelectorAll(".CodeMirror.cm-s-tistory-markdown"),
  ].find((e) => e.offsetParent !== null);
  if (!el || !el.CodeMirror) return { ok: false };
  el.CodeMirror.refresh();
  return { ok: true };
}

/** 모드 전환: confirm은 이 실행 동안만 우회하고 즉시 원복(try/finally) */
function switchToMarkdownMainWorld() {
  const originalConfirm = window.confirm;
  try {
    window.confirm = () => true;
    const dropdownBtn = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "기본모드",
    );
    if (!dropdownBtn) return { ok: false, error: "기본모드 버튼 못 찾음" };
    dropdownBtn.click();

    return new Promise((resolve) => {
      setTimeout(() => {
        const item = [
          ...document.querySelectorAll('[role="menuitem"], li, span'),
        ].find((el) => (el.textContent || "").trim() === "마크다운");
        if (!item) {
          window.confirm = originalConfirm;
          return resolve({ ok: false, error: "마크다운 메뉴 못 찾음" });
        }
        item.click();
        setTimeout(() => {
          window.confirm = originalConfirm; // 반드시 원복
          const switched = !!document.querySelector(
            ".CodeMirror.cm-s-tistory-markdown",
          );
          resolve({
            ok: switched,
            error: switched ? null : "클릭했지만 전환 안 됨",
          });
        }, 1000);
      }, 300);
    });
  } catch (e) {
    window.confirm = originalConfirm;
    return { ok: false, error: e.message };
  }
}

/** 완료 -> (autoConfirm이면) 공개 발행까지 클릭 */
function publishMainWorld(autoConfirm) {
  // 안전장치: 발행 직전 CM에 실제로 값이 있는지 마지막으로 한 번 더 확인
  const cmEl = [
    ...document.querySelectorAll(".CodeMirror.cm-s-tistory-markdown"),
  ].find((e) => e.offsetParent !== null);
  const bodyLen =
    cmEl && cmEl.CodeMirror ? cmEl.CodeMirror.getValue().trim().length : 0;
  if (autoConfirm && bodyLen <= 10) {
    return {
      ok: false,
      error: `발행 직전 본문이 비어있음(길이 ${bodyLen}) - 발행 중단`,
    };
  }

  const doneBtn = [...document.querySelectorAll("button")].find(
    (b) => (b.textContent || "").trim() === "완료",
  );
  if (!doneBtn) return { ok: false, error: "완료 버튼 못 찾음" };
  doneBtn.click();

  return new Promise((resolve) => {
    setTimeout(() => {
      const pubBtn = [...document.querySelectorAll("button")].find(
        (b) => (b.textContent || "").trim() === "공개 발행",
      );
      if (!pubBtn)
        return resolve({ ok: false, error: "공개발행 버튼 안 나타남" });
      if (!autoConfirm) return resolve({ ok: true, awaitingUser: true });
      pubBtn.click();
      resolve({ ok: true, awaitingUser: false });
    }, 800);
  });
}

function runMain(tabId, func, args) {
  return chrome.scripting
    .executeScript({ target: { tabId }, world: "MAIN", func, args })
    .then((r) => r[0]?.result || { ok: false, error: "no result" })
    .catch((e) => ({ ok: false, error: `executeScript 예외: ${e.message}` }));
}

// ── 큐 / 이력 (chrome.storage.local) ─────────────────────

async function getState() {
  const { v2tState } = await chrome.storage.local.get("v2tState");
  const defaultState = {
    username: null,
    queue: [],
    index: 0,
    published: [],
    autoConfirm: false,
    running: false,
    waitingPublish: false, // 수동 발행 상태 대기 여부
    skipPublished: true, // 이미 발행한 글 건너뛰기 기본값 ON
  };
  if (!v2tState) return defaultState;
  return { ...defaultState, ...v2tState };
}
async function setState(state) {
  await chrome.storage.local.set({ v2tState: state });
}

// ── 메시지 핸들러 ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "FETCH_POST":
      fetchVelogPost(msg.velogUrl)
        .then((post) => sendResponse({ ok: true, post }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;

    case "FETCH_IMAGE":
      fetch(msg.url)
        .then((r) => r.blob())
        .then((blob) =>
          blob.arrayBuffer().then((buf) => {
            sendResponse({
              ok: true,
              type: blob.type,
              data: Array.from(new Uint8Array(buf)),
            });
          }),
        )
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;

    case "READ_BODY":
      runMain(sender.tab.id, readBodyMainWorld, []).then(sendResponse);
      return true;

    case "INJECT_BODY":
      runMain(sender.tab.id, injectBodyMainWorld, [msg.text]).then(
        sendResponse,
      );
      return true;

    case "REFRESH_BODY":
      runMain(sender.tab.id, refreshBodyMainWorld, []).then(sendResponse);
      return true;

    case "SWITCH_MARKDOWN":
      runMain(sender.tab.id, switchToMarkdownMainWorld, []).then(sendResponse);
      return true;

    case "PUBLISH":
      runMain(sender.tab.id, publishMainWorld, [!!msg.autoConfirm]).then(
        sendResponse,
      );
      return true;

    // ── 큐 관리 ──
    case "FETCH_ALL_POSTS":
      fetchAllPosts(msg.username)
        .then((posts) => sendResponse({ ok: true, posts }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;

    case "START_QUEUE":
      (async () => {
        const state = await getState();
        state.username = msg.username;
        state.queue = msg.posts;
        state.index = 0;
        state.autoConfirm = !!msg.autoConfirm;
        state.skipPublished = msg.skipPublished !== false;
        state.running = true;
        state.waitingPublish = false;
        await setState(state);
        sendResponse({ ok: true });
      })();
      return true;

    case "GET_STATE":
      getState().then((state) => sendResponse({ ok: true, state }));
      return true;

    case "MARK_PUBLISHED":
      (async () => {
        const state = await getState();
        if (!state.published.includes(msg.slug)) state.published.push(msg.slug);
        state.index += 1;
        state.waitingPublish = false; // 발행 완료했으므로 대기 해제
        await setState(state);
        sendResponse({ ok: true, state });
      })();
      return true;

    case "SET_WAITING_PUBLISH":
      (async () => {
        const state = await getState();
        state.waitingPublish = !!msg.waitingPublish;
        await setState(state);
        sendResponse({ ok: true, state });
      })();
      return true;

    case "RESET_HISTORY":
      (async () => {
        const state = await getState();
        state.published = [];
        state.index = 0;
        state.waitingPublish = false;
        await setState(state);
        sendResponse({ ok: true, state });
      })();
      return true;

    case "STOP_QUEUE":
      (async () => {
        const state = await getState();
        state.running = false;
        state.waitingPublish = false;
        await setState(state);
        sendResponse({ ok: true });
      })();
      return true;
  }
});
