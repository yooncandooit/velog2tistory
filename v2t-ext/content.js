const CM_SEL = ".CodeMirror.cm-s-tistory-markdown";
const NEWPOST_PATH = "/manage/newpost/";

function status(msg, opts = {}) {
  let box = document.getElementById("v2t-status");
  if (!box) {
    box = document.createElement("div");
    box.id = "v2t-status";
    box.style.cssText =
      "position:fixed;bottom:16px;left:16px;z-index:999999;" +
      "background:#1a1a2e;color:#fff;padding:12px 32px 12px 16px;border-radius:8px;" +
      "font-size:13px;max-width:340px;line-height:1.5;box-shadow:0 4px 12px rgba(0,0,0,.35)";
    const close = document.createElement("span");
    close.textContent = "\u00d7";
    close.style.cssText =
      "position:absolute;top:6px;right:10px;cursor:pointer;font-size:16px;opacity:.7";
    close.onclick = () => box.remove();
    box.appendChild(close);
    const text = document.createElement("div");
    text.id = "v2t-status-text";
    box.appendChild(text);
    const btnRow = document.createElement("div");
    btnRow.id = "v2t-status-btn";
    btnRow.style.cssText = "margin-top:8px";
    box.appendChild(btnRow);
    document.body.appendChild(box);
  }
  box.querySelector("#v2t-status-text").textContent = "[v2t] " + msg;

  const btnRow = box.querySelector("#v2t-status-btn");
  btnRow.innerHTML = "";
  if (opts.buttonLabel) {
    const btn = document.createElement("button");
    btn.textContent = opts.buttonLabel;
    btn.style.cssText =
      "width:100%;padding:6px;cursor:pointer;border:none;border-radius:4px;" +
      "background:#4a9eff;color:#fff;font-size:12px";
    btn.onclick = opts.onClick;
    btnRow.appendChild(btn);
  }
  console.log("[v2t]", msg);
}

function waitFor(checkFn, desc, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      const r = checkFn();
      if (r) {
        clearInterval(timer);
        resolve(r);
      } else if (Date.now() - t0 > timeout) {
        clearInterval(timer);
        reject(new Error(`timeout: ${desc}`));
      }
    }, 500);
  });
}

const visibleCm = () =>
  [...document.querySelectorAll(CM_SEL)].find((el) => el.offsetParent !== null);
const editorIframe = () =>
  [...document.querySelectorAll("iframe")].find(
    (f) =>
      (f.title || "").includes("서식 있는 텍스트") && f.offsetParent !== null,
  );

async function fetchImageFile(url) {
  const resp = await chrome.runtime.sendMessage({ type: "FETCH_IMAGE", url });
  if (!resp.ok) throw new Error(`이미지 fetch 실패: ${resp.error}`);
  const blob = new Blob([new Uint8Array(resp.data)], { type: resp.type });
  const ext = (resp.type.split("/")[1] || "png").replace("jpeg", "jpg");
  return new File([blob], `migrated.${ext}`, { type: resp.type });
}

function uploadedSrcs(doc) {
  return new Set(
    [...doc.querySelectorAll("img")]
      .map((i) => i.src)
      .filter((s) => s.includes("kakaocdn")),
  );
}

function pasteFile(target, file) {
  const dt = new DataTransfer();
  dt.items.add(file);
  target.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function extractVelcdnUrls(md) {
  const seen = new Set(),
    out = [];
  for (const m of md.matchAll(/https:\/\/velog\.velcdn\.com\/[^\s)"'\]]+/g)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      out.push(m[0]);
    }
  }
  return out;
}

function extractTistoryUrls(md) {
  return [
    ...md.matchAll(/https?:\/\/[^\s)"']*(?:kakaocdn|daumcdn)[^\s)"']*/g),
  ].map((m) => m[0]);
}

function setTitle(title) {
  const el = document.querySelector(
    'textarea[placeholder*="제목"], input[placeholder*="제목"]',
  );
  if (!el) return false;
  const proto =
    el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, title);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function goToNewPost() {
  return new Promise((resolve) => {
    location.href = `${location.origin}${NEWPOST_PATH}`;
    resolve();
  });
}

function clickWriteButtonOrNavigate() {
  const btn = [...document.querySelectorAll("a, button")].find((el) => {
    const label = (el.textContent || "").trim();
    return label === "글쓰기";
  });
  if (btn) {
    status('"글쓰기" 버튼 자동 클릭...');
    btn.click();
  } else {
    status("글쓰기 버튼을 못 찾아 URL로 직접 이동합니다");
    goToNewPost();
  }
}

function dismissDraftPopup() {
  for (const label of ["취소", "닫기", "새 글 작성"]) {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === label,
    );
    if (btn) {
      btn.click();
      return true;
    }
  }
  return false;
}

async function migratePost({ title, body }, opts = {}) {
  const { autoSwitch = false, autoConfirm = false } = opts;

  await new Promise((r) => setTimeout(r, 500));
  if (dismissDraftPopup()) {
    status("자동저장 초안 팝업 닫음 - 새 글로 시작");
    await new Promise((r) => setTimeout(r, 500));
  }

  if (visibleCm()) {
    if (autoSwitch) {
      status("이미 마크다운 모드 - 기본모드로 되돌릴 수 없어 수동 확인 필요");
    }
    status("⚠ 기본모드로 전환해주세요 (이미지 업로드는 기본모드에서만 가능)");
    await waitFor(
      () => !visibleCm() && editorIframe(),
      "기본모드 전환",
      180000,
    );
  }
  const iframe = await waitFor(editorIframe, "에디터 iframe");
  const doc = iframe.contentDocument;

  const velcdnUrls = extractVelcdnUrls(body);
  const pastedSrcs = [];
  if (velcdnUrls.length > 0) {
    for (let i = 0; i < velcdnUrls.length; i++) {
      status(`이미지 업로드 중... (${i + 1}/${velcdnUrls.length})`);
      const file = await fetchImageFile(velcdnUrls[i]);
      const before = uploadedSrcs(doc);
      pasteFile(doc.body, file);
      const newSrc = await waitFor(
        () => {
          const fresh = [...uploadedSrcs(doc)].filter((s) => !before.has(s));
          return fresh[0] || null;
        },
        `이미지 ${i + 1} 업로드`,
        30000,
      );
      pastedSrcs.push(newSrc);
      await new Promise((r) => setTimeout(r, 800));
    }
    status(`이미지 ${velcdnUrls.length}개 업로드 완료`);
  } else {
    status("본문에 이미지 없음 - 바로 진행");
  }

  if (autoSwitch) {
    status("마크다운 모드로 자동 전환 중...");
    const sw = await chrome.runtime.sendMessage({ type: "SWITCH_MARKDOWN" });
    if (!sw.ok) {
      status(
        `자동 전환 실패(${sw.error}) - 직접 [기본모드→마크다운] 전환해주세요`,
      );
      await waitFor(visibleCm, "마크다운 모드 전환", 180000);
    } else {
      status("에디터 안정화 및 리스너 등록 대기 중...");
      await new Promise((r) => setTimeout(r, 1200));
    }
  } else {
    status("이제 [기본모드 → 마크다운]으로 전환해주세요 (팝업은 확인)");
    await waitFor(visibleCm, "마크다운 모드 전환", 180000);
  }
  await new Promise((r) => setTimeout(r, 1000));

  let tistoryUrls = pastedSrcs;
  if (velcdnUrls.length > 0) {
    const read = await chrome.runtime.sendMessage({ type: "READ_BODY" });
    if (read.ok) {
      const converted = extractTistoryUrls(read.value);
      if (converted.length === velcdnUrls.length) {
        tistoryUrls = converted;
        status("변환된 마크다운에서 정식 이미지 URL 캡처 완료");
      } else {
        status(
          `변환 URL ${converted.length}개 ≠ 업로드 ${velcdnUrls.length}개 - paste 캡처분 사용`,
        );
      }
    }
  }

  let finalBody = body;
  velcdnUrls.forEach((v, i) => {
    finalBody = finalBody.split(v).join(tistoryUrls[i]);
  });

  status("본문 주입 중...");
  const inject = await chrome.runtime.sendMessage({
    type: "INJECT_BODY",
    text: finalBody,
  });
  if (!inject.ok) throw new Error(`본문 주입 실패: ${inject.error}`);

  await new Promise((r) => setTimeout(r, 1000));
  await chrome.runtime.sendMessage({ type: "REFRESH_BODY" });
  await new Promise((r) => setTimeout(r, 1000));

  const verify = await chrome.runtime.sendMessage({ type: "READ_BODY" });
  const bodyOk = verify.ok && verify.value && verify.value.trim().length > 10;
  if (!bodyOk) {
    status("본문 반영 확인 실패 - 2차 재주입 시도...");
    const retry = await chrome.runtime.sendMessage({
      type: "INJECT_BODY",
      text: finalBody,
    });
    if (!retry.ok) throw new Error(`본문 재주입 실패: ${retry.error}`);
    await new Promise((r) => setTimeout(r, 1500));
    await chrome.runtime.sendMessage({ type: "REFRESH_BODY" });
    await new Promise((r) => setTimeout(r, 1000));
    const verify2 = await chrome.runtime.sendMessage({ type: "READ_BODY" });
    if (!verify2.ok || !verify2.value || verify2.value.trim().length <= 10) {
      throw new Error(
        "본문 주입이 반영되지 않음 (재시도 후에도 실패) - 자동 발행 중단",
      );
    }
  }
  status(`본문 반영 확인 완료 (${verify.value ? verify.value.length : "?"}자)`);

  const titleOk = setTitle(title);

  if (!autoConfirm) {
    status(
      `완료! (본문 ${inject.length}자${titleOk ? ", 제목 입력됨" : ", ⚠ 제목은 직접 입력"}) ` +
        `- 확인 후 [완료 → 공개 발행]을 눌러주세요`,
    );
    return { published: false };
  }

  status("발행 진행 중(완료 → 공개 발행)...");
  const pub = await chrome.runtime.sendMessage({
    type: "PUBLISH",
    autoConfirm: true,
  });
  if (!pub.ok) {
    status(
      `자동 발행 실패(${pub.error}) - 직접 [완료 → 공개 발행]을 눌러주세요`,
    );
    return { published: false };
  }
  status("발행 완료!");
  return { published: true };
}

async function migrateOne(velogUrl) {
  try {
    status("velog 글 가져오는 중...");
    const resp = await chrome.runtime.sendMessage({
      type: "FETCH_POST",
      velogUrl,
    });
    if (!resp.ok) throw new Error(`velog fetch 실패: ${resp.error}`);
    const { title, body } = resp.post;
    status(`글 확인: "${title}" (${body.length}자)`);
    await migratePost(
      { title, body },
      { autoSwitch: false, autoConfirm: false },
    );
  } catch (e) {
    status(`실패: ${e.message}`);
    console.error("[v2t]", e);
  }
}

async function runQueue() {
  const { state } = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (!state.running || state.index >= state.queue.length) {
    status(state.queue.length ? "모든 글 처리 완료" : "큐가 비어있습니다");
    return;
  }

  if (state.waitingPublish) {
    await chrome.runtime.sendMessage({
      type: "SET_WAITING_PUBLISH",
      waitingPublish: false,
    });
  }

  const post = state.queue[state.index];

  if (state.skipPublished && state.published.includes(post.url_slug)) {
    await chrome.runtime.sendMessage({
      type: "MARK_PUBLISHED",
      slug: post.url_slug,
    });
    return runQueue();
  }

  status(
    `[${state.index + 1}/${state.queue.length}] "${post.title}" 처리 시작`,
  );
  try {
    const result = await migratePost(
      { title: post.title, body: post.body },
      { autoSwitch: true, autoConfirm: state.autoConfirm },
    );
    if (result.published) {
      await chrome.runtime.sendMessage({
        type: "MARK_PUBLISHED",
        slug: post.url_slug,
      });
      status(
        `[${state.index + 1}/${state.queue.length}] 완료 - 다음 글로 이동`,
      );
      goToNewPost();
    } else {
      await chrome.runtime.sendMessage({
        type: "SET_WAITING_PUBLISH",
        waitingPublish: true,
      });

      status(
        `[${state.index + 1}/${state.queue.length}] 확인 후 [완료 → 공개 발행]을 직접 눌러주세요.\n` +
          `발행이 끝나면 아래 버튼을 눌러 다음 글로 넘어갑니다.`,
        {
          buttonLabel: "다음 글로 (이 글 발행 완료함)",
          onClick: async () => {
            await chrome.runtime.sendMessage({
              type: "MARK_PUBLISHED",
              slug: post.url_slug,
            });
            status("다음 글로 이동합니다...");
            await new Promise((r) => setTimeout(r, 500));
            goToNewPost();
          },
        },
      );
    }
  } catch (e) {
    status(
      `[${state.index + 1}/${state.queue.length}] 실패: ${e.message} - 다음 글로 건너뜁니다`,
    );
    console.error("[v2t]", e);
    await chrome.runtime.sendMessage({
      type: "MARK_PUBLISHED",
      slug: post.url_slug,
    });
    await new Promise((r) => setTimeout(r, 1500));
    goToNewPost();
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "MIGRATE_ONE") migrateOne(msg.velogUrl);
  if (msg.type === "RUN_QUEUE") runQueue();
});

(async () => {
  console.log("[v2t] 로드됨:", location.pathname);
  const { state } = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  if (!state.running || state.index >= state.queue.length) return;

  if (state.waitingPublish && !location.pathname.startsWith(NEWPOST_PATH)) {
    const post = state.queue[state.index];
    status(
      `이전 글 "${post.title}" 발행 완료 확인! 다음 글로 연속 이전을 진행합니다.`,
    );

    await chrome.runtime.sendMessage({
      type: "MARK_PUBLISHED",
      slug: post.url_slug,
    });

    const { state: newState } = await chrome.runtime.sendMessage({
      type: "GET_STATE",
    });
    if (newState.index >= newState.queue.length) {
      status("모든 글 처리 완료!");
      return;
    }

    await new Promise((r) => setTimeout(r, 1000));
    clickWriteButtonOrNavigate();
    return;
  }

  if (location.pathname.startsWith(NEWPOST_PATH)) {
    status("이전 큐 이어서 진행 중...");
    await new Promise((r) => setTimeout(r, 1500));
    runQueue();
    return;
  }

  if (location.pathname.startsWith("/manage/")) {
    await new Promise((r) => setTimeout(r, 800));
    clickWriteButtonOrNavigate();
  }
})();
