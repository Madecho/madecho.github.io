import { mountViewer } from "./viewer.js";
const local = ["localhost", "127.0.0.1"].includes(location.hostname);
const API = local ? "http://127.0.0.1:5173" : "https://knot-recognition-study-24.docile-mite-7634.chatgpt.site";
const LABELS = ["皮卡丘", "牛来", "火斑喵", "炎兔儿", "快龙", "哈克龙", "小火马", "咩利羊", "小火焰猴", "火稚鸡", "炎帝", "暖暖猪", "无法判断"];
const app = document.querySelector("#app");
const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};
const fragment = new URLSearchParams(location.hash.slice(1));
let token = fragment.get("invite") || read("knot24-invite", "");
if (fragment.has("invite")) write("knot24-invite", token);
let state = null,
  known = {},
  pending = {},
  current = 0,
  controller = null,
  view = null,
  ready = false,
  flushing = false,
  conflict = false,
  entered = Date.now(),
  loadGeneration = 0;
const key = () => `knot24:${token.split(".")[0]}`;
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function persist() {
  write(key(), { state, known, pending, current });
}
async function api(path, body) {
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 20000);
  try {
    const r = await fetch(API + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "X-Invite": token, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort.signal,
    });
    const result = await r.json();
    if (!r.ok) {
      const e = new Error(result.error || "请求失败");
      e.status = r.status;
      throw e;
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}
function dispose() {
  loadGeneration++;
  controller?.abort();
  view?.dispose();
  view = null;
  ready = false;
}
function message(title, body, button) {
  dispose();
  app.innerHTML = `<main class="welcome"><p class="eyebrow">模型识别评价</p><h1>${title}</h1><p>${escape(body)}</p>${button ? '<button class="btn primary" id="reload">重新连接</button>' : ""}</main>`;
  document.querySelector("#reload")?.addEventListener("click", () => location.reload());
}
function login() {
  app.innerHTML = `<main class="welcome"><p class="eyebrow">模型识别评价</p><h1>欢迎参加。</h1><p class="intro">请使用你的个人邀请链接。每人使用一个链接，可中途退出后继续。</p><div class="box"><h2>已有邀请链接？</h2><label for="invite">将个人邀请链接粘贴在这里</label><input class="input" id="invite" autocomplete="off" placeholder="粘贴完整链接"><button class="btn primary wide" id="enter">进入评价</button><p id="entry-error" class="muted"></p></div><p class="smallprint">本次评价会保存参与编号、你填写的姓名或昵称、角色选择和操作时间。无需填写真实姓名。</p></main>`;
  document.querySelector("#enter").onclick = () => {
    const value = document.querySelector("#invite").value.trim();
    let t = value;
    try {
      t = new URLSearchParams(new URL(value).hash.slice(1)).get("invite") || "";
    } catch {}
    if (!/^(R0[1-9]|R10|T0[1-3])\.[a-f0-9]{64}$/.test(t)) {
      document.querySelector("#entry-error").textContent = "请粘贴完整的个人邀请链接。";
      return;
    }
    token = t;
    write("knot24-invite", t);
    location.hash = "invite=" + t;
    boot();
  };
}
function identify() {
  dispose();
  app.innerHTML = `<main class="welcome"><p class="eyebrow">模型识别评价 · ${escape(state.participant)}${state.mode === "test" ? " · 测试答卷" : ""}</p><h1>怎么称呼你？</h1><p class="intro">填写姓名或昵称，方便对应本次答卷。可以使用昵称，无需填写真实姓名。</p><form id="name-form" class="box"><label for="display-name">姓名或昵称</label><input class="input" id="display-name" autocomplete="off" maxlength="80" required value="${escape(state.displayName || read(key() + ":name-draft", ""))}" placeholder="请输入姓名或昵称"><p class="muted">1–40个字符。同一链接续答时会保留。</p><p id="name-error" class="notice error" hidden></p><button class="btn primary wide" type="submit">保存并继续</button></form><p class="smallprint">姓名或昵称随答卷保存，仅你本人和有权访问评价数据的账号可查看。</p></main>`;
  const input = document.querySelector("#display-name");
  input.addEventListener("input", () => write(key() + ":name-draft", input.value));
  document.querySelector("#name-form").onsubmit = async (event) => {
    event.preventDefault();
    const displayName = input.value.normalize("NFC").trim(),
      err = document.querySelector("#name-error"),
      button = document.querySelector("#name-form button");
    if (!displayName || [...displayName].length > 40 || /[\p{Cc}\p{Cf}]/u.test(displayName)) {
      err.hidden = false;
      err.textContent = "请输入1–40个字符的姓名或昵称，请勿使用换行或控制字符。";
      return;
    }
    button.disabled = true;
    try {
      state = await api("profile", { displayName });
      persist();
      write(key() + ":name-draft", displayName);
      await boot();
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
      button.disabled = false;
    }
  };
}
function intro() {
  dispose();
  app.innerHTML = `<main class="welcome"><p class="eyebrow">模型识别评价 · ${state.participant}${state.mode === "test" ? " · 测试答卷" : ""}</p><h1>看看模型，<br>认出它是谁。</h1><p class="intro">你将看到 24 件可以旋转查看的模型。每次选择你认为对应的角色；认不出来时，选“无法判断”即可。</p><div class="chips"><span class="chip">24 件模型</span><span class="chip">每件 1 道选择题</span><span class="chip">支持中途继续</span></div><p class="muted">请独立作答，不查询角色图片、不与其他参与者讨论答案。评价过程中不会公布正确答案。</p><div class="box"><h2>开始前，确认一件事</h2><label class="check"><input type="radio" name="eligible" value="yes">我没有看过本次建模使用的参考照片</label><label class="check"><input type="radio" name="eligible" value="no">我已经看过这些参考照片</label></div><div class="box"><h2>你原本认识哪些角色？</h2><p class="muted">请选择你知道大致外形的角色；不认识的不用选，不需要查资料。</p><div class="familiar">${LABELS.slice(
    0,
    12
  )
    .map((x, i) => `<label class="check"><input type="checkbox" name="familiar" value="${i}">${x}</label>`)
    .join(
      ""
    )}</div><label class="check" style="margin-top:20px"><input type="checkbox" id="fam-confirm">以上选择已确认（都不认识可以不勾选）</label></div><p>姓名或昵称：${escape(state.displayName)} <button class="btn link" id="edit-name">修改称呼</button></p><p id="intro-error" class="notice error" hidden></p><button id="start" class="btn primary wide">开始评价</button><p class="smallprint">答案与参与编号、姓名或昵称一同保存，仅用于本次研究。可以随时退出，并用同一邀请链接继续。</p></main>`;
  document.querySelector("#edit-name").onclick = identify;
  document.querySelector("#start").onclick = async () => {
    const eligible = document.querySelector("input[name=eligible]:checked"),
      err = document.querySelector("#intro-error");
    if (!eligible || !document.querySelector("#fam-confirm").checked) {
      err.hidden = false;
      err.textContent = "请确认是否看过参考照片，并确认角色熟悉度。";
      return;
    }
    const button = document.querySelector("#start");
    button.disabled = true;
    try {
      state = await api("start", {
        eligible: eligible.value === "yes",
        familiarity: [...document.querySelectorAll("input[name=familiar]:checked")].map((x) => Number(x.value)),
      });
      persist();
      if (state.eligible !== 1) message("谢谢你的说明。", "这次评价需要尚未看过参考照片的参与者，你的答卷不会纳入正式评价。");
      else showQuestion(0);
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
      button.disabled = false;
    }
  };
}
function selected(id) {
  return pending[id]?.choice ?? known[id]?.choice;
}
function count() {
  return state.items.filter((x) => selected(x.id) !== undefined).length;
}
function updateStatus(error = "") {
  const saved = document.querySelector("#save"),
    n = Object.keys(pending).length;
  if (saved)
    saved.textContent =
      error || (conflict ? "答案发生冲突，请重新连接核对" : n ? `${n} 题待同步${flushing ? " · 正在保存" : " · 网络恢复后重试"}` : "所有答案已保存");
  const done = document.querySelector("#done-count");
  if (done) done.textContent = `已回答 ${count()}/24`;
  const bar = document.querySelector("#progress-fill");
  if (bar) bar.style.width = (count() / 24) * 100 + "%";
  document.querySelectorAll(".choice").forEach((b) => {
    b.disabled = !ready || conflict;
    b.classList.toggle("selected", Number(b.dataset.choice) === selected(state.items[current]?.id));
    b.setAttribute("aria-checked", String(b.classList.contains("selected")));
  });
  const next = document.querySelector("#next");
  if (next) next.disabled = selected(state.items[current]?.id) === undefined || !ready || conflict;
}
async function flush() {
  if (flushing || conflict || !state || state.completedAt) return;
  flushing = true;
  updateStatus();
  try {
    for (const [id, entry] of Object.entries(pending)) {
      try {
        const result = await api("answer", {
          item: id,
          choice: entry.choice,
          revision: entry.baseRevision,
          elapsedMs: entry.elapsedMs,
          rendered: true,
        });
        known[id] = result;
        if (pending[id]?.nonce === entry.nonce) delete pending[id];
        else if (pending[id]) pending[id].baseRevision = result.revision;
        persist();
        updateStatus();
      } catch (e) {
        if (e.status === 409) {
          const remote = await api("state");
          const answer = remote.answers.find((a) => a.item === id);
          if (answer && answer.choice === entry.choice && answer.revision > entry.baseRevision) {
            known[id] = answer;
            if (pending[id]?.nonce === entry.nonce) delete pending[id];
            else pending[id].baseRevision = answer.revision;
            persist();
            continue;
          }
          conflict = true;
          updateStatus("这道题在其他窗口有修改，请重新连接核对。");
          const warning = document.querySelector("#question-error");
          if (warning) {
            warning.hidden = false;
            warning.textContent = "请用同一个窗口继续。点“重新连接”读取已保存答案后，再确认你的选择。";
          }
          return;
        }
        updateStatus("尚有答案待保存 · 正在等待网络");
        return;
      }
    }
  } finally {
    flushing = false;
    updateStatus();
  }
}
async function showQuestion(index) {
  dispose();
  current = index;
  entered = Date.now();
  persist();
  const item = state.items[index],
    generation = loadGeneration;
  app.innerHTML = `<main class="study"><header class="top"><div><div class="top-title">模型识别评价</div><div class="meta">${state.participant}${state.mode === "test" ? " · 测试答卷" : ""}</div></div><span class="badge" id="done-count">已回答 ${count()}/24</span></header><div class="progress"><span id="progress-fill" style="width:${(count() / 24) * 100}%"></span></div><div class="workarea"><section class="model" aria-label="可旋转的三维模型"><canvas id="model-canvas" aria-label="拖动旋转模型，双指缩放"></canvas><div class="loading" id="loading"><span class="spinner"></span><span id="load-text">正在加载模型…</span></div><div class="model-tools"><p class="muted">拖动旋转 · 双指缩放</p><button class="btn link" id="reset">恢复正面</button></div></section><section class="question"><p class="eyebrow">第 ${index + 1} / 24 件</p><h1>你认为这个模型<br>对应哪个角色？</h1><p class="muted">请选择一项。不确定时，可以选“无法判断”。</p><div class="choices" role="radiogroup" aria-label="角色选择">${LABELS.map((x, i) => `<button class="choice" role="radio" aria-checked="false" data-choice="${i}" disabled>${x}</button>`).join("")}</div><p id="question-error" class="notice error" hidden></p><button class="btn link" id="reconnect">重新连接</button></section></div></main><footer class="controls"><div class="controls-inner"><button class="btn" id="prev" ${index === 0 ? "disabled" : ""}>上一件</button><div class="save" id="save" role="status" aria-live="polite"></div><button class="btn primary" id="next" disabled>${index === 23 ? "检查并提交" : "下一件"}</button></div></footer>`;
  document.querySelector("#prev").onclick = () => showQuestion(index - 1);
  document.querySelector("#next").onclick = () => (index === 23 ? review() : showQuestion(index + 1));
  document.querySelector("#reset").onclick = () => view?.reset();
  document.querySelector("#reconnect").onclick = async () => {
    conflict = false;
    await boot(true);
  };
  document.querySelectorAll(".choice").forEach(
    (button) =>
      (button.onclick = () => {
        if (!ready || conflict) return;
        const prev = pending[item.id];
        pending[item.id] = {
          choice: Number(button.dataset.choice),
          baseRevision: prev?.baseRevision ?? known[item.id]?.revision ?? 0,
          elapsedMs: Math.min(86400000, Math.round(Date.now() - entered)),
          nonce: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
        };
        persist();
        updateStatus();
        flush();
      })
  );
  updateStatus();
  controller = new AbortController();
  try {
    const v = await mountViewer(document.querySelector("#model-canvas"), API + "/api/assets/" + item.assetPath.replace(/^models\//, ""), {
      signal: controller.signal,
      onProgress: ({ loaded, total }) => {
        if (generation === loadGeneration) {
          const el = document.querySelector("#load-text");
          if (el) el.textContent = `正在加载模型… ${total ? Math.round((loaded / total) * 100) : 0}%`;
        }
      },
      onError: (e) => {
        if (generation === loadGeneration) loadError(e, index);
      },
    });
    if (generation !== loadGeneration) {
      v.dispose();
      return;
    }
    view = v;
    ready = true;
    entered = Date.now();
    document.querySelector("#loading").hidden = true;
    updateStatus();
  } catch (e) {
    if (e.name !== "AbortError" && generation === loadGeneration) loadError(e, index);
  }
}
function loadError(e, index) {
  ready = false;
  updateStatus();
  const panel = document.querySelector("#loading");
  if (panel) {
    panel.hidden = false;
    panel.innerHTML = `<strong>模型暂未显示成功</strong><p>${escape(e.message || "请检查网络后重试。")}</p><button class="btn primary" id="retry-model">重新加载</button><p class="muted">加载问题不会算作识别错误。</p>`;
    document.querySelector("#retry-model").onclick = () => showQuestion(index);
  }
}
function review() {
  dispose();
  app.innerHTML = `<main class="welcome"><p class="eyebrow">模型识别评价 · ${state.participant}</p><h1>检查一下，再提交。</h1><p>已回答 ${count()} / 24 件。点击序号可以返回查看或修改。</p><div class="review-grid">${state.items.map((x, i) => `<button data-item="${i}" class="${selected(x.id) === undefined ? "missing" : ""}">${i + 1}${selected(x.id) === undefined ? " · 未答" : " ✓"}</button>`).join("")}</div><p id="save" class="notice" role="status"></p><p id="submit-error" class="notice error" hidden></p><button class="btn primary wide" id="submit">提交全部答案</button><p class="smallprint">提交后将结束本次评价，不再修改答案。不会显示正确答案。</p></main>`;
  document.querySelectorAll("[data-item]").forEach((x) => (x.onclick = () => showQuestion(Number(x.dataset.item))));
  updateStatus();
  document.querySelector("#submit").onclick = async () => {
    const b = document.querySelector("#submit"),
      err = document.querySelector("#submit-error");
    b.disabled = true;
    err.hidden = true;
    await flush();
    if (count() !== 24 || Object.keys(pending).length || conflict) {
      err.hidden = false;
      err.textContent = "请答完全部24件，并等待所有答案保存成功。";
      b.disabled = false;
      return;
    }
    try {
      const r = await api("submit", {});
      state.completedAt = r.completedAt;
      persist();
      complete();
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message;
      b.disabled = false;
    }
  };
}
function complete() {
  dispose();
  app.innerHTML = `<main class="welcome"><div class="done-mark">✓</div><p class="eyebrow">${state.mode === "test" ? "测试答卷" : "评价"}已提交 · ${state.participant}</p><h1>谢谢，已收到你的评价。</h1><p>24 件模型的答案已全部保存，可以关闭页面了。</p><p class="muted">为避免影响其他参与者，请暂时不要讨论模型或分享自己的答案。</p>${state.mode === "test" ? '<p class="notice">这是测试答卷，不会进入正式统计。</p>' : ""}</main>`;
}
async function boot(resolveConflict = false) {
  if (!token) {
    login();
    return;
  }
  const cache = read(key(), {});
  pending = cache.pending || {};
  current = cache.current || 0;
  try {
    state = await api("state");
    known = Object.fromEntries(state.answers.map((a) => [a.item, a]));
    for (const [id, p] of Object.entries(pending)) {
      const a = known[id];
      if (a && a.revision > p.baseRevision) {
        if (a.choice === p.choice) delete pending[id];
        else if (resolveConflict) delete pending[id];
        else conflict = true;
      }
    }
    persist();
  } catch (e) {
    if (e.status === 401) {
      message("邀请链接无法使用", e.message, false);
      return;
    }
    if (cache.state?.startedAt && cache.state.eligible === 1) {
      state = cache.state;
      known = cache.known || {};
    } else {
      message("暂时连接不上", e.message || "请检查网络后重试。", true);
      return;
    }
  }
  if (!state.displayName) {
    identify();
    return;
  }
  if (state.completedAt) {
    pending = {};
    persist();
    complete();
    return;
  }
  if (!state.startedAt) {
    if (state.mode === "formal" && !state.formalOpen) message("评价还未开放。", "正在确认手机微信中的加载和保存情况，请稍后用同一链接进入。", true);
    else intro();
    return;
  }
  if (state.eligible !== 1) {
    message("谢谢你的说明。", "本次需要尚未看过参考照片的参与者，你的答卷不会纳入正式评价。");
    return;
  }
  current = Math.max(0, Math.min(current, 23));
  showQuestion(current);
  flush();
}
addEventListener("online", () => flush());
setInterval(() => {
  if (Object.keys(pending).length) flush();
}, 10000);
addEventListener("hashchange", () => {
  const next = new URLSearchParams(location.hash.slice(1)).get("invite");
  if (next && next !== token) {
    persist();
    dispose();
    token = next;
    write("knot24-invite", token);
    state = null;
    known = {};
    pending = {};
    conflict = false;
    boot();
  }
});
addEventListener("beforeunload", (e) => {
  persist();
  if (Object.keys(pending).length) {
    e.preventDefault();
    e.returnValue = "";
  }
});
boot();
