/* =====================================================================
   کنکور علیرضا — منطق برنامه
   ===================================================================== */
'use strict';

/* ---------- ابزارها ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const faNum = n => Number(n).toLocaleString('fa-IR');
const LETTERS = ['الف', 'ب', 'ج', 'د'];
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const SUBJECTS = ['ریاضی', 'فیزیک', 'شیمی', 'زیست‌شناسی', 'ادبیات فارسی', 'زبان انگلیسی', 'دینی', 'زمین‌شناسی'];
const GRADES = ['دهم', 'یازدهم', 'دوازدهم'];
const STORE_Q = 'ka_custom_questions_v1';
const STORE_H = 'ka_history_v1';

const BUILTIN = (window.KONKOOR_QUESTIONS || []).map(q => Object.assign({}, q, { builtin: true }));

function loadCustom() { try { return JSON.parse(localStorage.getItem(STORE_Q) || '[]'); } catch (e) { return []; } }
function saveCustom(list) { localStorage.setItem(STORE_Q, JSON.stringify(list)); }
function loadHistory() { try { return JSON.parse(localStorage.getItem(STORE_H) || '[]'); } catch (e) { return []; } }
function saveHistory(list) { localStorage.setItem(STORE_H, JSON.stringify(list.slice(0, 60))); }
function allQuestions() { return BUILTIN.concat(loadCustom()); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function fmtClock(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

const state = { exam: null, lastExam: null, timerId: null, result: null };

/* ---------- مودال و توست ---------- */
function openModal(title, bodyHtml, buttons) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  const row = $('#modal-buttons');
  row.innerHTML = '';
  (buttons || []).forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + (b.cls || '');
    btn.textContent = b.label;
    btn.onclick = () => { if (b.fn) b.fn(); };
    row.appendChild(btn);
  });
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }

function askConfirm(msg, onYes, yesLabel) {
  openModal('تأیید', '<p class="modal-msg">' + msg + '</p>', [
    { label: yesLabel || 'بله', cls: 'primary', fn: () => { closeModal(); onYes(); } },
    { label: 'انصراف', fn: closeModal }
  ]);
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- رمز معلم ---------- */
const TEACHER_CODE = String(window.TEACHER_CODE || '1395');
let teacherAuthed = false;
try { teacherAuthed = sessionStorage.getItem('ka_teacher_auth') === '1'; } catch (e) { /* ignore */ }

function askCode(onOk) {
  openModal('رمز معلم',
    '<p class="modal-msg">این بخش مخصوص معلم است. کد معلم را وارد کنید:</p>' +
    '<input type="password" id="code-input" dir="ltr" inputmode="numeric" autocomplete="off" placeholder="********">',
    [
      { label: 'تأیید', cls: 'primary', fn: () => {
          const v = ($('#code-input') ? $('#code-input').value : '').trim();
          if (v === TEACHER_CODE) {
            teacherAuthed = true;
            try { sessionStorage.setItem('ka_teacher_auth', '1'); } catch (e) { /* ignore */ }
            closeModal();
            toast('خوش آمدید، معلم ✓');
            onOk();
          } else {
            toast('رمز اشتباه است');
            const i = $('#code-input');
            if (i) { i.value = ''; i.focus(); }
          }
        } },
      { label: 'انصراف', fn: closeModal }
    ]);
  setTimeout(() => {
    const i = $('#code-input');
    if (!i) return;
    i.focus();
    i.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const ok = $$('#modal-buttons .btn.primary')[0];
        if (ok) ok.click();
      }
    });
  }, 80);
}

/* ---------- جابه‌جایی بین ویوها ---------- */
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  window.scrollTo(0, 0);
}
function renderView(name) {
  if (name === 'home') renderHome();
  if (name === 'bank') renderBank();
  if (name === 'history') renderHistory();
}
function navTo(name) {
  if (name === 'bank' && !teacherAuthed) {
    askCode(() => { showView('bank'); renderBank(); });
    return;
  }
  if (state.exam && name !== 'exam' && name !== 'result') {
    askConfirm('آزمون‌تان هنوز تمام نشده است. اگر خارج شوید، این آزمون لغو می‌شود.', () => {
      clearInterval(state.timerId);
      state.exam = null;
      state.result = null;
      showView(name);
      renderView(name);
    }, 'خروج از آزمون');
    return;
  }
  showView(name);
  renderView(name);
}

/* ---------- خانه / تنظیم آزمون ---------- */
function poolFor(subject, grade) {
  return allQuestions().filter(q =>
    (subject === 'همه' || q.subject === subject) &&
    (grade === 'همه' || q.grade === grade));
}

function renderHome() {
  const all = allQuestions();
  const counts = {};
  all.forEach(q => { counts[q.subject] = (counts[q.subject] || 0) + 1; });
  $('#stat-total').textContent = faNum(all.length);
  $('#subject-chips').innerHTML = SUBJECTS.map(s =>
    '<span class="chip">' + s + ': <b>' + faNum(counts[s] || 0) + '</b></span>').join('');

  $('#set-subject').innerHTML =
    '<option value="همه">همه دروس (آزمون مخلوط)</option>' +
    SUBJECTS.map(s => '<option value="' + s + '">' + s + '</option>').join('');
  $('#set-grade').innerHTML =
    '<option value="همه">همه سال‌های تحصیلی</option>' +
    GRADES.map(g => '<option value="' + g + '">' + g + '</option>').join('');
  updateCountOptions();
}

function updateCountOptions() {
  const subject = $('#set-subject').value, grade = $('#set-grade').value;
  const pool = poolFor(subject, grade);
  const sel = $('#set-count');
  const cur = sel.value;
  sel.innerHTML = [5, 10, 15, 20, 25].filter(n => n <= pool.length)
    .map(n => '<option value="' + n + '">' + faNum(n) + ' سؤال</option>').join('') +
    (pool.length ? '<option value="all">همه سؤالات (' + faNum(pool.length) + ')</option>' : '');
  if (pool.length) {
    const has = Array.from(sel.options).some(o => o.value === cur);
    sel.value = has ? cur : String(Math.min(10, pool.length));
  }
  const note = $('#set-count-note');
  note.textContent = pool.length
    ? 'در این انتخاب ' + faNum(pool.length) + ' سؤال موجود است'
    : 'در این درس/سال سؤال موجود نیست — درس دیگری را انتخاب کنید';
  note.classList.toggle('bad', !pool.length);
  updateTimeTotal();
}

function selectedCount() {
  const v = $('#set-count').value;
  if (v === 'all') return poolFor($('#set-subject').value, $('#set-grade').value).length;
  return parseInt(v, 10) || 0;
}

function updateTimeTotal() {
  const n = selectedCount();
  const secPerQ = parseInt($('#set-time').value, 10) || 60;
  const total = n * secPerQ;
  $('#time-total').textContent = n
    ? 'مدت کل آزمون: ' + faNum(Math.floor(total / 60)) + ' دقیقه و ' + faNum(total % 60) + ' ثانیه'
    : '';
}

function startExam() {
  const name = $('#set-name').value.trim();
  const subject = $('#set-subject').value;
  const grade = $('#set-grade').value;
  const secPerQ = parseInt($('#set-time').value, 10) || 60;
  const negative = $('#set-negative').checked;

  const pool = poolFor(subject, grade);
  if (!pool.length) {
    openModal('سؤال کافی نیست',
      '<p class="modal-msg">در این درس و سال، سؤالی در بانک وجود ندارد. درس‌های دارای سؤال: ' +
      SUBJECTS.filter(s => poolFor(s, 'همه').length).join('، ') + '</p>',
      [{ label: 'باشه' }]);
    return;
  }
  const count = Math.min(selectedCount() || 5, pool.length);

  const qs = shuffle(pool).slice(0, count).map(q => {
    const order = shuffle([0, 1, 2, 3]);
    return {
      id: q.id,
      subject: q.subject,
      grade: q.grade,
      q: q.q,
      options: order.map(i => q.options[i]),
      answer: order.indexOf(q.answer),
      explain: q.explain || ''
    };
  });

  state.exam = {
    qs, answers: {}, flags: {}, idx: 0,
    timeLeft: count * secPerQ,
    meta: { name, subject, grade, negative, total: count }
  };
  state.lastExam = null;
  state.result = null;
  showView('exam');
  renderExam();
  startTimer();
}

/* ---------- آزمون ---------- */
function renderExam() {
  const ex = state.exam;
  if (!ex) return;
  const q = ex.qs[ex.idx];
  const answered = ex.qs.filter(x => ex.answers[x.id] !== undefined).length;

  $('#ex-title').textContent =
    (ex.meta.subject === 'همه' ? 'آزمون مخلوط' : ex.meta.subject) + ' · ' +
    (ex.meta.grade === 'همه' ? 'دهم تا دوازدهم' : ex.meta.grade);
  $('#ex-progress').textContent = faNum(answered) + ' از ' + faNum(ex.qs.length) + ' سؤال پاسخ داده شده';

  $('#q-num').textContent = 'سؤال ' + faNum(ex.idx + 1) + ' از ' + faNum(ex.qs.length);
  $('#q-subject').textContent = q.subject + ' · ' + q.grade;
  $('#q-text').textContent = q.q;

  $('#q-options').innerHTML = q.options.map((opt, i) =>
    '<button type="button" class="opt' + (ex.answers[q.id] === i ? ' sel' : '') + '" data-i="' + i + '">' +
    '<span class="opt-letter">' + LETTERS[i] + '</span>' +
    '<span class="opt-text">' + escapeHtml(opt) + '</span></button>').join('');

  $('#q-nav').innerHTML = ex.qs.map((qq, i) => {
    let cls = 'qnav';
    if (i === ex.idx) cls += ' cur';
    if (ex.answers[qq.id] !== undefined) cls += ' ans';
    if (ex.flags[qq.id]) cls += ' flag';
    return '<button type="button" class="' + cls + '" data-i="' + i + '" title="' + escapeHtml(qq.subject) + '">' + faNum(i + 1) + '</button>';
  }).join('');

  $('#btn-flag').classList.toggle('flagged', !!ex.flags[q.id]);
  $('#btn-flag').textContent = ex.flags[q.id] ? '◉ علامت‌گذاری شد' : '◯ علامت‌گذاری';
  $('#btn-clear').disabled = ex.answers[q.id] === undefined;
  $('#btn-prev').disabled = ex.idx === 0;
  $('#btn-next').disabled = ex.idx === ex.qs.length - 1;
  updateTimerDisplay();
}

function startTimer() {
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    if (!state.exam) { clearInterval(state.timerId); return; }
    state.exam.timeLeft--;
    updateTimerDisplay();
    if (state.exam.timeLeft <= 0) {
      clearInterval(state.timerId);
      submitExam(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const el = $('#timer');
  if (!state.exam) return;
  el.textContent = fmtClock(Math.max(0, state.exam.timeLeft));
  el.classList.toggle('warn', state.exam.timeLeft <= 120 && state.exam.timeLeft > 60);
  el.classList.toggle('danger', state.exam.timeLeft <= 60);
}

function submitExam(auto) {
  const ex = state.exam;
  if (!ex) return;
  const blanks = ex.qs.filter(q => ex.answers[q.id] === undefined).length;

  if (!auto && blanks > 0) {
    askConfirm(faNum(blanks) + ' سؤال بی‌پاسخ دارید. با این حال آزمون را تمام می‌کنید؟', () => doSubmit(), 'بله، پایان بده');
    return;
  }
  doSubmit();

  function doSubmit() {
    clearInterval(state.timerId);
    const exRef = ex;
    let correct = 0, wrong = 0, blank = 0;
    ex.qs.forEach(q => {
      const a = ex.answers[q.id];
      if (a === undefined) blank++;
      else if (a === q.answer) correct++;
      else wrong++;
    });
    const total = ex.qs.length * 3;
    const penalty = ex.meta.negative ? 0.75 : 0;
    const score = Math.round((correct * 3 - wrong * penalty) * 100) / 100;
    const percent = total ? Math.round(Math.max(0, score) / total * 100) : 0;
    const res = {
      name: ex.meta.name || 'دانش‌آموز',
      subject: ex.meta.subject,
      grade: ex.meta.grade,
      negative: ex.meta.negative,
      correct, wrong, blank, total, score, percent,
      dateStr: new Date().toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })
    };
    state.result = res;
    state.lastExam = exRef;
    state.exam = null;
    const hist = loadHistory();
    hist.unshift(res);
    saveHistory(hist);
    showView('result');
    renderResult();
  }
}

/* ---------- نتیجه ---------- */
function renderResult() {
  const r = state.result;
  const ex = state.lastExam || state.exam;
  if (!r || !ex) return;

  $('#res-name').textContent = 'نتیجه آزمون — ' + r.name;
  $('#res-meta').textContent =
    (r.subject === 'همه' ? 'آزمون مخلوط' : r.subject) + ' · ' +
    (r.grade === 'همه' ? 'دهم تا دوازدهم' : r.grade) + ' · ' + r.dateStr;
  $('#res-score').textContent = faNum(r.score);
  $('#res-total').textContent = 'از ' + faNum(r.total) + ' امتیاز';
  $('#res-percent').textContent = faNum(r.percent);
  $('#res-bar').style.width = r.percent + '%';

  $('#stat-correct').textContent = faNum(r.correct);
  $('#stat-wrong').textContent = faNum(r.wrong);
  $('#stat-blank').textContent = faNum(r.blank);
  $('#stat-penalty').textContent = r.negative ? '−' + faNum(Math.round(r.wrong * 0.75 * 100) / 100) : '—';

  $('#review-list').innerHTML = ex.qs.map((q, i) => {
    const a = ex.answers[q.id];
    const cls = a === undefined ? 'blank' : (a === q.answer ? 'ok' : 'no');
    const badge = a === undefined ? 'بی‌پاسخ' : (a === q.answer ? 'درست' : 'غلط');
    const opts = q.options.map((opt, j) => {
      let ocls = '';
      if (j === q.answer) ocls = 'ok';
      else if (j === a) ocls = 'no';
      const mark = j === q.answer ? ' ✓' : (j === a ? ' ✗' : '');
      return '<div class="ri-opt ' + ocls + '">' + LETTERS[j] + ') ' + escapeHtml(opt) + mark + '</div>';
    }).join('');
    const expl = q.explain ? '<p class="ri-explain">💡 ' + escapeHtml(q.explain) + '</p>' : '';
    return '<div class="review-item ' + cls + '">' +
      '<div class="ri-head"><span>سؤال ' + faNum(i + 1) + ' — ' + q.subject + ' · ' + q.grade + '</span>' +
      '<span class="ri-badge">' + badge + '</span></div>' +
      '<p class="ri-q">' + escapeHtml(q.q) + '</p>' +
      '<div class="ri-opts">' + opts + '</div>' + expl + '</div>';
  }).join('');
}

function copyResult() {
  const r = state.result;
  if (!r) return;
  const text =
    'آزمون کنکور علیرضا\n' +
    'نام: ' + r.name + '\n' +
    'درس: ' + (r.subject === 'همه' ? 'آزمون مخلوط' : r.subject) + ' (' + (r.grade === 'همه' ? 'دهم تا دوازدهم' : r.grade) + ')\n' +
    'امتیاز: ' + r.score + ' از ' + r.total + ' (درصد: ' + r.percent + '%)\n' +
    'درست: ' + r.correct + ' | غلط: ' + r.wrong + ' | بی‌پاسخ: ' + r.blank + '\n' +
    'تاریخ: ' + r.dateStr;
  const fallback = () => openModal('نتیجه آزمون',
    '<textarea id="copy-box" readonly rows="9">' + escapeHtml(text) + '</textarea>',
    [
      { label: 'کپی', cls: 'primary', fn: () => {
          const ta = $('#copy-box');
          ta.select();
          try { document.execCommand('copy'); toast('کپی شد ✓'); } catch (e) { /* ignore */ }
        } },
      { label: 'بستن' }
    ]);
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast('نتیجه کپی شد ✓')).catch(fallback);
  } else fallback();
}

/* ---------- بانک سؤال (معلم) ---------- */
function renderBank() {
  const custom = loadCustom();
  $('#bank-count').textContent = faNum(custom.length);
  $('#bank-list').innerHTML = custom.length ? custom.map(q =>
    '<div class="bank-item">' +
    '<div class="bank-item-head"><b>' + escapeHtml(q.subject) + '</b><span>' + escapeHtml(q.grade) + '</span>' +
    '<button type="button" class="btn mini danger" data-del="' + q.id + '">حذف</button></div>' +
    '<p>' + escapeHtml(q.q) + '</p>' +
    '<p class="bank-answer">پاسخ صحیح: ' + LETTERS[q.answer] + ') ' + escapeHtml(q.options[q.answer]) + '</p>' +
    '</div>').join('')
    : '<p class="empty">هنوز سؤالی اضافه نکرده‌اید. سؤال‌های نمونه در صفحه‌ی «خانه» آماده‌ی استفاده‌اند.</p>';

  if (!$('#bf-subject').innerHTML.trim()) {
    $('#bf-subject').innerHTML = SUBJECTS.map(s => '<option value="' + s + '">' + s + '</option>').join('');
    $('#bf-grade').innerHTML = GRADES.map(g => '<option value="' + g + '">' + g + '</option>').join('');
  }
}

function addBankQuestion(e) {
  e.preventDefault();
  const subject = $('#bf-subject').value;
  const grade = $('#bf-grade').value;
  const qText = $('#bf-q').value.trim();
  const opts = [0, 1, 2, 3].map(i => $('#bf-opt' + i).value.trim());
  const ans = parseInt($('#bf-ans').value, 10);
  const explain = $('#bf-explain').value.trim();

  if (!qText) { toast('متن سؤال را بنویسید'); return; }
  if (opts.some(o => !o)) { toast('هر چهار گزینه را کامل کنید'); return; }

  const list = loadCustom();
  list.push({
    id: 'c' + Date.now() + Math.floor(Math.random() * 999),
    subject, grade, q: qText, options: opts, answer: ans, explain
  });
  saveCustom(list);
  e.target.reset();
  renderBank();
  toast('سؤال به بانک اضافه شد ✓');
}

function exportBank() {
  const data = loadCustom();
  const json = JSON.stringify(data, null, 2);
  openModal('خروجی بانک سؤالات (JSON)',
    '<p class="modal-msg">این متن را در یک فایل با پسوند .json ذخیره کنید (یا دکمه‌ی دانلود را بزنید):</p>' +
    '<textarea id="export-box" readonly rows="10">' + escapeHtml(json) + '</textarea>',
    [
      { label: '⬇ دانلود فایل', cls: 'primary', fn: () => {
          const blob = new Blob([json], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'konkoor-alireza-questions.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          closeModal();
          toast('فایل در حال دانلود است');
        } },
      { label: 'بستن' }
    ]);
  setTimeout(() => { const ta = $('#export-box'); if (ta) ta.select(); }, 60);
}

function importBank(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!Array.isArray(data)) throw new Error('not array');
      const valid = data.filter(q =>
        q && q.subject && q.grade && q.q &&
        Array.isArray(q.options) && q.options.length === 4 &&
        typeof q.answer === 'number' && q.answer >= 0 && q.answer < 4);
      if (!valid.length) throw new Error('empty');
      const list = loadCustom();
      valid.forEach(q => {
        if (!q.id) q.id = 'c' + Date.now() + Math.floor(Math.random() * 999);
        const i = list.findIndex(x => x.id === q.id);
        if (i >= 0) list[i] = q; else list.push(q);
      });
      saveCustom(list);
      renderBank();
      toast(faNum(valid.length) + ' سؤال وارد بانک شد ✓');
    } catch (err) {
      openModal('خطا در خواندن فایل',
        '<p class="modal-msg">فایل درست نیست. باید یک آرایه‌ی JSON با فیلدهای subject، grade، q، options (۴ گزینه) و answer (۰ تا ) باشد.</p>',
        [{ label: 'باشه' }]);
    }
  };
  r.readAsText(file);
}

/* ---------- نتایج ---------- */
function renderHistory() {
  const h = loadHistory();
  $('#history-list').innerHTML = h.length ? h.map(r =>
    '<div class="hist-row">' +
    '<div class="hist-main"><b>' + escapeHtml(r.name) + '</b>' +
    '<span>' + (r.subject === 'همه' ? 'آزمون مخلوط' : r.subject) + ' · ' +
    (r.grade === 'همه' ? 'دهم تا دوازدهم' : r.grade) + ' · ' + escapeHtml(r.dateStr) + '</span></div>' +
    '<div class="hist-score">' + faNum(r.score) + ' <small>/ ' + faNum(r.total) + '</small></div>' +
    '<div class="hist-pct">' + faNum(r.percent) + '٪</div></div>').join('')
    : '<p class="empty">هنوز نتیجه‌ای ثبت نشده است. اول یک آزمون بدهید.</p>';
}

/* ---------- اتصال رویدادها ---------- */
$$('.navlink, .brand').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  navTo(a.dataset.view);
}));

$('#start-form').addEventListener('submit', e => { e.preventDefault(); startExam(); });
$('#set-subject').addEventListener('change', updateCountOptions);
$('#set-grade').addEventListener('change', updateCountOptions);
$('#set-count').addEventListener('change', updateTimeTotal);
$('#set-time').addEventListener('change', updateTimeTotal);

$('#q-options').addEventListener('click', e => {
  const b = e.target.closest('.opt');
  if (!b || !state.exam) return;
  state.exam.answers[state.exam.qs[state.exam.idx].id] = parseInt(b.dataset.i, 10);
  renderExam();
});
$('#q-nav').addEventListener('click', e => {
  const b = e.target.closest('.qnav');
  if (!b || !state.exam) return;
  state.exam.idx = parseInt(b.dataset.i, 10);
  renderExam();
});
$('#btn-prev').onclick = () => { if (state.exam && state.exam.idx > 0) { state.exam.idx--; renderExam(); } };
$('#btn-next').onclick = () => { if (state.exam && state.exam.idx < state.exam.qs.length - 1) { state.exam.idx++; renderExam(); } };
$('#btn-flag').onclick = () => {
  if (!state.exam) return;
  const id = state.exam.qs[state.exam.idx].id;
  state.exam.flags[id] = !state.exam.flags[id];
  renderExam();
};
$('#btn-clear').onclick = () => {
  if (!state.exam) return;
  delete state.exam.answers[state.exam.qs[state.exam.idx].id];
  renderExam();
};
$('#btn-submit').onclick = () => submitExam(false);
$('#btn-result-home').onclick = () => navTo('home');
$('#btn-copy').onclick = copyResult;

$('#bank-form').addEventListener('submit', addBankQuestion);
$('#bank-list').addEventListener('click', e => {
  const b = e.target.closest('[data-del]');
  if (!b) return;
  const id = b.dataset.del;
  askConfirm('این سؤال حذف شود؟', () => {
    saveCustom(loadCustom().filter(q => q.id !== id));
    renderBank();
    toast('سؤال حذف شد');
  }, 'حذف');
});
$('#btn-export').onclick = exportBank;
$('#btn-import').onclick = () => $('#import-file').click();
$('#import-file').addEventListener('change', e => {
  importBank(e.target.files[0]);
  e.target.value = '';
});

$('#btn-clear-history').onclick = () => {
  const doClear = () => askConfirm('همه‌ی نتایج پاک شود؟', () => {
    saveHistory([]);
    renderHistory();
    toast('نتایج پاک شد');
  }, 'پاک‌کردن');
  if (teacherAuthed) doClear();
  else askCode(doClear);
};

/* کلیدهای ۱ تا  برای انتخاب سریع گزینه */
document.addEventListener('keydown', e => {
  if (!state.exam || !$('#view-exam').classList.contains('active')) return;
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key >= '1' && e.key <= '4') {
    const i = parseInt(e.key, 10) - 1;
    const q = state.exam.qs[state.exam.idx];
    state.exam.answers[q.id] = i;
    renderExam();
  }
});

/* بستن مودال با کلیک روی بیرون کارت */
$('#modal').addEventListener('click', e => {
  if (e.target === $('#modal')) closeModal();
});

/* ---------- شروع ---------- */
renderHome();
showView('home');
