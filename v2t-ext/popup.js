const msgEl = document.getElementById("msg");
const setMsg = (t) => (msgEl.textContent = t);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function send(msg) {
  const tab = await activeTab();
  return chrome.tabs.sendMessage(tab.id, msg);
}

document.getElementById("goOne").addEventListener("click", async () => {
  const velogUrl = document.getElementById("url").value.trim();
  if (!velogUrl.includes("velog.io/@"))
    return setMsg("velog 글 URL 형식이 아닙니다");
  try {
    await send({ type: "MIGRATE_ONE", velogUrl });
    setMsg("시작됨 - 페이지 좌하단 상태창을 확인하세요!");
  } catch (e) {
    setMsg("티스토리 글쓰기 페이지(새 글)에서 실행해주세요");
  }
});

document.getElementById("fetchAll").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  if (!username) return setMsg("velog 아이디를 입력해주세요");
  setMsg("전체 글 목록 가져오는 중...");
  const resp = await chrome.runtime.sendMessage({
    type: "FETCH_ALL_POSTS",
    username,
  });
  if (!resp.ok) return setMsg("실패: " + resp.error);
  window.__v2tPosts = resp.posts;
  window.__v2tUsername = username;
  setMsg(
    `${resp.posts.length}개 글 확인됨 (오래된 순 정렬됨)\n"이전 시작"을 눌러주세요`,
  );
});

document.getElementById("start").addEventListener("click", async () => {
  if (!window.__v2tPosts)
    return setMsg("먼저 '모든 게시물 목록 가져오기' 버튼을 눌러주세요");
  const autoConfirm = document.getElementById("autoConfirm").checked;
  const skipPublished = document.getElementById("skipPublished").checked;

  await chrome.runtime.sendMessage({
    type: "START_QUEUE",
    username: window.__v2tUsername,
    posts: window.__v2tPosts,
    autoConfirm,
    skipPublished,
  });
  try {
    await send({ type: "RUN_QUEUE" });
    setMsg("큐 실행 시작 - 페이지 좌하단 상태창을 확인하세요!");
  } catch (e) {
    setMsg("티스토리 글쓰기 페이지(새 글)에서 실행해주세요");
  }
});

document.getElementById("stop").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_QUEUE" });
  setMsg("중단 요청됨 - 진행 중인 글까지만 처리 후 멈춥니다");
});

// 발행 이력 초기화 버튼 이벤트 바인딩
document.getElementById("resetHistory").addEventListener("click", async () => {
  const resp = await chrome.runtime.sendMessage({ type: "RESET_HISTORY" });
  if (resp.ok) {
    setMsg("발행 이력이 초기화되었습니다.\n처음부터 전체 이전이 가능합니다.");
  } else {
    setMsg("발행 이력 초기화 실패");
  }
});

// 팝업 열릴 때 진행 상황 및 설정 값 복원
(async () => {
  const { ok, state } = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (ok) {
    if (state.queue && state.queue.length > 0) {
      setMsg(
        `이전 상태: ${state.index}/${state.queue.length} 완료` +
          (state.running ? " (진행 중)" : " (중단됨)"),
      );
    }
    document.getElementById("autoConfirm").checked = !!state.autoConfirm;
    document.getElementById("skipPublished").checked =
      state.skipPublished !== false;
  }
})();
