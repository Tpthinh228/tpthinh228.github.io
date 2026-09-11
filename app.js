// Patched to remove corrupted fragments; configure GEMINI_API_KEY separately.
/* ============ Dữ liệu mẫu ============ */
const DEFAULT_ADMINS = [
  { user: 'admin', pass: 'admin123', role: 'super', ap: null }
];
const SAMPLE_SEASONS = [];
const SAMPLE_HOUSEHOLDS = [];
const SAMPLE_QUALITY = [];
const SAMPLE_OUTPUTS = [];
const SAMPLE_PROCUREMENTS = [];
const AI_SUGGESTIONS = [
  'Mùa vụ nào có năng suất thấp nhất?',
  'Chỉ tiêu kiểm định nào đang không đạt và vì sao?',
  'Đầu ra nào đang phù hợp với hộ trồng rau móp?',
  'Ước tính giá trị kinh tế toàn xã hiện nay?'
];

let seasons = [];
let households = [];
let qualityTests = [];
let outputs = [];
let procurements = [];
let products = [];
let personUsers = [];
let currentPersonUser = null; // { username, role: 'grower'|'buyer', displayName, phone, ap }
let admins = [];
let currentUser = null; // { user, role: 'super'|'ward', ap }
let activity = [];
let isAdmin = false;
let isSuperAdmin = false;
let chart = null;
let wardChart = null;
let sortKey = null;
let sortDir = 1;
let chatHistory = [];
let lastRemoteHash = '';
let firstLoadDone = false;

/* ============ Tiện ích ============ */
function seasonRevenue(s){ return Number(s.yieldTon||0) * 1000 * Number(s.price||0); }
function csvEscape(v){ const str = String(v==null?'':v); if(/[",\n]/.test(str)) return '"' + str.replace(/"/g,'""') + '"'; return str; }
function emptyRow(colspan, text){
  return `<tr><td colspan="${colspan}" class="empty"><svg class="icon"><use href="#icon-sprout"/></svg>${text}</td></tr>`;
}
function money(n){ return Number(n||0).toLocaleString('vi-VN'); }
function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }
function relTime(ts){
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff/60000);
  if(m < 1) return 'vừa xong';
  if(m < 60) return m + ' phút trước';
  const h = Math.floor(m/60);
  if(h < 24) return h + ' giờ trước';
  return Math.floor(h/24) + ' ngày trước';
}
function toast(msg, type){
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' '+type : '');
  el.textContent = msg;
  stack.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(), 250); }, 3200);
}
function animateCount(el, to, isMoney){
  const from = Number(el.getAttribute('data-val')||0);
  el.setAttribute('data-val', to);
  const dur = 500, start = performance.now();
  function step(now){
    const p = Math.min(1, (now-start)/dur);
    const eased = 1 - Math.pow(1-p, 3);
    const val = from + (to-from)*eased;
    el.textContent = isMoney ? (val/1000000).toLocaleString('vi-VN',{maximumFractionDigits:1})+'tr' : Math.round(val).toLocaleString('vi-VN');
    if(p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ============ Firebase (Authentication + Firestore) ============ */
import { initializeApp, deleteApp }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updatePassword
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, collection
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/* !!! ĐÁNH DẤU 1: dán firebaseConfig thật của bạn vào đây
   (Console Firebase → biểu tượng bánh răng → Project settings → mục "Your apps") */
const firebaseConfig = {
  apiKey: "AIzaSyDuqly5ejTvMgr3a6OKNvcwGPd3jk7nlZk",
  authDomain: "binhmy-nongnghiep.firebaseapp.com",
  projectId: "binhmy-nongnghiep",
  storageBucket: "binhmy-nongnghiep.firebasestorage.app",
  messagingSenderId: "356707994338",
  appId: "1:356707994338:web:df236f5580c0ea2731ecbb"
};

/* !!! ĐÁNH DẤU 2: dán Gemini API key vào đây nếu muốn dùng "Trợ lý AI" (lấy miễn phí tại
   aistudio.google.com/apikey). Để trống thì các phần khác vẫn chạy bình thường,
   chỉ riêng Trợ lý AI sẽ báo lỗi khi bấm hỏi. */
// WARNING: Không commit API key thật. Hãy cấu hình qua môi trường triển khai hoặc file local không theo dõi bởi git.
const GEMINI_API_KEY = '';

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/* Firebase Auth cần dạng email thật, nên "tên đăng nhập" của bạn được quy đổi thành
   1 email giả nội bộ, người dùng không cần biết/thấy email này. */
function adminEmail(username){ return username.trim().toLowerCase() + '@canbo.binhmy.local'; }
function personEmail(username){ return username.trim().toLowerCase() + '@nguoidung.binhmy.local'; }

/* Tạo tài khoản Firebase Auth mới MÀ KHÔNG làm mất phiên đăng nhập hiện tại.
   (Mặc định Firebase tự đăng nhập vào tài khoản vừa tạo — cần tránh khi
   Quản trị viên đang tạo tài khoản CHO NGƯỜI KHÁC, không phải cho chính mình.) */
async function createAuthUserWithoutSignIn(email, password){
  const secondaryApp = initializeApp(firebaseConfig, 'secondary-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try{
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    return uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

/* Trợ lý AI — gọi thẳng Gemini từ trình duyệt (thay cho Google Apps Script trước đây) */
async function apiAskAI(prompt){
  if(!GEMINI_API_KEY) throw new Error('Chưa cấu hình GEMINI_API_KEY trong app.js');
  // ĐÃ SỬA: model cũ "gemini-2.0-flash" đã bị Google shut down từ 1/6/2026 (mọi request
  // đều lỗi 404 dù API key đúng). Đổi sang alias "gemini-flash-latest" để luôn tự động
  // trỏ tới model Flash ổn định mới nhất, không cần sửa code mỗi lần Google đổi model.
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + GEMINI_API_KEY;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!text) throw new Error(json?.error?.message || 'Không có phản hồi từ AI');
  return text;
}
/* ============ Lưu trữ dùng chung — Firestore, có đồng bộ thời gian thực ============ */
const APPDATA_KEYS = ['seasons','households','qualityTests','outputs','procurements','products','activity'];
const DEFAULT_APPDATA = {
  seasons: SAMPLE_SEASONS,
  households: SAMPLE_HOUSEHOLDS,
  qualityTests: SAMPLE_QUALITY,
  outputs: SAMPLE_OUTPUTS,
  procurements: SAMPLE_PROCUREMENTS,
  products: [],
  activity: []
};
function applyAppDataValue(key, value){
  switch(key){
    case 'seasons': seasons = value || []; break;
    case 'households': households = value || []; break;
    case 'qualityTests': qualityTests = value || []; break;
    case 'outputs': outputs = value || []; break;
    case 'procurements': procurements = value || []; break;
    case 'products': products = value || []; break;
    case 'activity': activity = value || []; break;
  }
}

/* Tải dữ liệu lần đầu (trước khi render lần đầu tiên) */
async function loadData(){
  for(const key of APPDATA_KEYS){
    try{
      const snap = await getDoc(doc(db, 'appData', key));
      const value = snap.exists() ? snap.data().value : (DEFAULT_APPDATA[key] || []);
      applyAppDataValue(key, value);
    }catch(e){ applyAppDataValue(key, []); }
  }
  try{
    const snap = await getDocs(collection(db, 'admins'));
    admins = snap.docs.map(d=>({ uid: d.id, ...d.data() }));
  }catch(e){ admins = []; }
  try{
    const snap = await getDocs(collection(db, 'personUsers'));
    personUsers = snap.docs.map(d=>({ uid: d.id, ...d.data() }));
  }catch(e){ personUsers = []; }
}

/* Lắng nghe thay đổi thời gian thực — thay hoàn toàn cho việc "poll mỗi 60 giây" trước đây.
   Nhiều người mở trang cùng lúc sẽ tự thấy cập nhật của nhau ngay lập tức. */
function setupRealtime(){
  APPDATA_KEYS.forEach(key=>{
    onSnapshot(doc(db, 'appData', key), (snap)=>{
      applyAppDataValue(key, snap.exists() ? snap.data().value : []);
      renderAll();
      if(firstLoadDone && key!=='activity') toast('Dữ liệu vừa được cập nhật', 'warn');
      firstLoadDone = true;
    }, (err)=>console.error('Lỗi đồng bộ ' + key, err));
  });
  onSnapshot(collection(db, 'admins'), (snap)=>{
    admins = snap.docs.map(d=>({ uid: d.id, ...d.data() }));
    if(currentUser){ const me = admins.find(a=>a.uid===currentUser.uid); if(me) currentUser = me; }
    renderAll();
    if(document.getElementById('accountsOverlay')?.classList.contains('show')) renderAccountsTable();
  }, (err)=>console.error('Lỗi đồng bộ admins', err));
  onSnapshot(collection(db, 'personUsers'), (snap)=>{
    personUsers = snap.docs.map(d=>({ uid: d.id, ...d.data() }));
    if(currentPersonUser){ const me = personUsers.find(u=>u.uid===currentPersonUser.uid); if(me) currentPersonUser = me; }
  }, (err)=>console.error('Lỗi đồng bộ personUsers', err));
}

async function saveAppData(key, value){
  try{ await setDoc(doc(db, 'appData', key), { value }); }catch(e){ console.error(e); }
}
async function saveSeasons(){ await saveAppData('seasons', seasons); }
async function saveHouseholds(){ await saveAppData('households', households); }
async function saveActivity(){ await saveAppData('activity', activity); }
async function saveQualityTests(){ await saveAppData('qualityTests', qualityTests); }
async function saveOutputs(){ await saveAppData('outputs', outputs); }
async function saveProcurements(){ await saveAppData('procurements', procurements); }
async function saveProducts(){ await saveAppData('products', products); }

async function logActivity(text){
  activity.unshift({ ts: Date.now(), text });
  activity = activity.slice(0, 20);
  renderActivity();
  await saveActivity();
}

/* Khôi phục phiên đăng nhập khi tải lại trang (Firebase tự nhớ phiên đăng nhập trong trình duyệt) */
onAuthStateChanged(auth, async (user)=>{
  if(!user){
    currentUser = null; isAdmin = false; isSuperAdmin = false; currentPersonUser = null;
    renderAll(); return;
  }
  try{
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    if(adminSnap.exists()){
      currentUser = { uid: user.uid, ...adminSnap.data() }; isAdmin = true; isSuperAdmin = currentUser.role === 'super';
    }else{
      const personSnap = await getDoc(doc(db, 'personUsers', user.uid));
      if(personSnap.exists()) currentPersonUser = { uid: user.uid, ...personSnap.data() };
    }
  }catch(e){ console.error('Lỗi khôi phục phiên đăng nhập', e); }
  renderAll();
});

/* ============ Đồng hồ trực tiếp ============ */
function tickClock(){
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('vi-VN') + ' · ' + now.toLocaleDateString('vi-VN');
}

/* ============ Render ============ */
function canManage(ap){
  if(!currentUser) return false;
  if(currentUser.role === 'super') return true;
  return currentUser.role === 'ward' && currentUser.ap === ap;
}
function canManageProc(p){
  if(!p) return false;
  if(canManage(p.ap)) return true;
  return !!(currentPersonUser && currentPersonUser.role==='buyer' && p.ownerUsername===currentPersonUser.username);
}
function canManageProduct(p){
  if(!p) return false;
  if(canManage(p.ap)) return true;
  return !!(currentPersonUser && currentPersonUser.role==='grower' && p.ownerUsername===currentPersonUser.username);
}
function actorLabel(){
  if(currentUser) return currentUser.user;
  if(currentPersonUser) return currentPersonUser.displayName + ' (' + personRoleLabel(currentPersonUser.role) + ')';
  return 'ẩn danh';
}
function seasonRegion(id){ const s = seasons.find(x=>x.id===Number(id)); return s ? s.region : null; }
function roleLabel(role){ return role==='super' ? 'Quản trị viên xã' : 'Cán bộ ấp'; }

function renderAuthArea(){
  const el = document.getElementById('authArea');
  if(currentUser){
    el.innerHTML = `
      <span class="sync-pill" style="gap:6px;"><span class="dot" style="background:${isSuperAdmin?'var(--bloom)':'var(--river)'}"></span>${currentUser.user} · ${roleLabel(currentUser.role)}${currentUser.ap ? ' ('+currentUser.ap+')' : ''}</span>
      ${isSuperAdmin ? `<button class="btn btn-sm" onclick="openAccountsModal()">Quản lý tài khoản</button>` : ''}
      <button class="btn btn-sm" onclick="openPwForm()">Đổi mật khẩu</button>
      <button class="btn btn-sm btn-danger" onclick="logout()">Đăng xuất</button>`;
  }else{
    el.innerHTML = `<button class="btn btn-sm" onclick="openLogin()">Cán bộ đăng nhập</button>`;
  }
  document.getElementById('addBtn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('addHhBtn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('addQualityBtn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('addOutputBtn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('addProcBtn').style.display = (isAdmin || (currentPersonUser && currentPersonUser.role==='buyer')) ? 'inline-block' : 'none';
  document.getElementById('addProductBtn').style.display = (isAdmin || (currentPersonUser && currentPersonUser.role==='grower')) ? 'inline-block' : 'none';
}

function personRoleLabel(role){ return role==='grower' ? 'Hộ trồng' : 'Quán ăn / Chợ'; }

function renderPersonAuthArea(){
  const el = document.getElementById('personAuthArea');
  if(currentPersonUser){
    el.innerHTML = `
      <span class="sync-pill" style="gap:6px;"><span class="dot" style="background:var(--papaya)"></span>${currentPersonUser.displayName} · ${personRoleLabel(currentPersonUser.role)}</span>
      <button class="btn btn-sm btn-danger" onclick="personLogout()">Đăng xuất</button>`;
  }else{
    el.innerHTML = `<button class="btn btn-sm btn-primary" onclick="openPersonAuth('login')">Đăng nhập / Đăng ký</button>`;
  }
}

function statCard(id, value, label, accent, isMoney, icon){
  return `<div class="stat-card" style="--accent:${accent}">
    ${icon ? `<svg class="icon"><use href="#${icon}"/></svg>` : ''}
    <div class="num-face" id="${id}" data-val="0">0</div>
    <div class="lbl">${label}</div>
  </div>`;
}

function renderStatsGrid(){
  const totalArea = seasons.reduce((a,s)=>a+Number(s.area||0),0);
  const totalYield = seasons.reduce((a,s)=>a+Number(s.yieldTon||0),0);
  const totalRevenue = seasons.reduce((a,s)=>a+seasonRevenue(s),0);
  const avgYield = totalArea>0 ? (totalYield/totalArea) : 0;
  const grid = document.getElementById('statsGrid');
  if(!grid.hasChildNodes()){
    grid.innerHTML =
      statCard('statCount', seasons.length, 'Mùa vụ', 'var(--paddy)', false, 'icon-count') +
      statCard('statArea', totalArea, 'Tổng diện tích (ha)', 'var(--river)', false, 'icon-area') +
      statCard('statYield', totalYield, 'Tổng sản lượng (tấn)', 'var(--papaya)', false, 'icon-yield') +
      statCard('statAvg', avgYield, 'Năng suất TB (tấn/ha)', 'var(--bloom)', false, 'icon-avg') +
      statCard('statRevenue', totalRevenue, 'Giá trị ước tính', 'var(--paddy-deep)', true, 'icon-revenue');
  }
  animateCount(document.getElementById('statCount'), seasons.length);
  animateCount(document.getElementById('statArea'), totalArea);
  animateCount(document.getElementById('statYield'), totalYield);
  document.getElementById('statAvg').textContent = avgYield.toFixed(2);
  animateCount(document.getElementById('statRevenue'), totalRevenue, true);
}

function statusChip(s){
  return s==='plan' ? '<span class="chip chip-plan">Lên kế hoạch</span>'
    : s==='growing' ? '<span class="chip chip-growing">Đang canh tác</span>'
    : '<span class="chip chip-done">Đã thu hoạch</span>';
}
function householdName(id){ if(!id) return '—'; const h = households.find(x=>x.id===Number(id)); return h ? h.name : '—'; }

function sortedSeasons(list){
  if(!sortKey) return list;
  const arr = [...list];
  arr.sort((a,b)=>{
    let av, bv;
    if(sortKey==='household'){ av = householdName(a.householdId); bv = householdName(b.householdId); }
    else if(sortKey==='revenue'){ av = seasonRevenue(a); bv = seasonRevenue(b); }
    else { av = a[sortKey]; bv = b[sortKey]; }
    if(typeof av === 'string' || typeof bv === 'string'){
      av = (av==null?'':String(av)).toLowerCase(); bv = (bv==null?'':String(bv)).toLowerCase();
      return av.localeCompare(bv) * sortDir;
    }
    return ((av||0) - (bv||0)) * sortDir;
  });
  return arr;
}
function currentFilteredSeasons(){
  const filter = document.getElementById('filterStatus').value;
  const q = document.getElementById('searchSeason').value.trim().toLowerCase();
  let list = filter==='all' ? seasons : seasons.filter(s=>s.status===filter);
  if(q){
    list = list.filter(s =>
      (s.name||'').toLowerCase().includes(q) || (s.crop||'').toLowerCase().includes(q) ||
      (s.region||'').toLowerCase().includes(q) || householdName(s.householdId).toLowerCase().includes(q));
  }
  return sortedSeasons(list);
}

function renderTable(){
  const list = currentFilteredSeasons();
  const body = document.getElementById('tableBody');
  if(list.length===0){
    body.innerHTML = emptyRow(13, 'Không tìm thấy mùa vụ phù hợp.');
  }else{
    body.innerHTML = list.map(s=>`
      <tr>
        <td>${s.name}</td><td>${s.crop}</td><td>${householdName(s.householdId)}</td><td>${s.region}</td>
        <td>${s.start||''}</td><td>${s.end||''}</td><td>${s.area}</td><td>${s.yieldTon}</td>
        <td>${s.price ? money(s.price) : '—'}</td>
        <td>${seasonRevenue(s) ? money(seasonRevenue(s)) : '—'}</td>
        <td>${s.specialty ? '<span class="chip chip-specialty">Đặc sản</span>' : ''}</td>
        <td>${statusChip(s.status)}</td>
        <td class="row-actions">
          ${canManage(s.region) ? `<button class="btn btn-sm" onclick="openForm(${s.id})">Sửa</button>
            <button class="btn btn-sm btn-danger" onclick="deleteSeason(${s.id})">Xóa</button>` : ''}
        </td>
      </tr>`).join('');
  }
  document.querySelectorAll('#subview-ql-muavu th.sortable').forEach(th=>{
    const key = th.getAttribute('data-sort');
    th.textContent = th.textContent.replace(/ [▲▼]$/,'');
    if(key===sortKey){ th.textContent += sortDir===1 ? ' ▲' : ' ▼'; }
  });
}

function exportCsv(){
  const list = currentFilteredSeasons();
  const header = ['Tên mùa vụ','Cây trồng','Hộ trồng','Ấp','Bắt đầu','Kết thúc','Diện tích (ha)','Sản lượng (tấn)','Giá TT (đ/kg)','Giá trị ước tính (đ)','Đặc sản','Trạng thái'];
  const rows = list.map(s=>[s.name, s.crop, householdName(s.householdId), s.region, s.start||'', s.end||'',
    s.area, s.yieldTon, s.price||0, seasonRevenue(s), s.specialty?'Có':'Không',
    s.status==='plan'?'Lên kế hoạch':s.status==='growing'?'Đang canh tác':'Đã thu hoạch']);
  const csv = [header, ...rows].map(r=>r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'mua-vu-binh-my.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('Đã xuất file CSV', 'ok');
}

function renderChart(){
  const ctx = document.getElementById('yieldChart');
  if(!ctx) return; // đã được thay bằng thông báo lỗi ở lần render trước
  if(typeof Chart === 'undefined'){
    ctx.replaceWith(Object.assign(document.createElement('p'), { className:'empty', innerHTML:'<svg class="icon"><use href="#icon-sprout"/></svg>Không tải được thư viện biểu đồ (cần kết nối mạng lần đầu để tải Chart.js).' }));
    return;
  }
  const labels = seasons.map(s=>s.name);
  const data = seasons.map(s=>Number(s.yieldTon||0));
  if(chart) chart.destroy();
  chart = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Sản lượng (tấn)', data,
    backgroundColor: '#2F9E44', borderRadius: 6, maxBarThickness: 46 }] },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#E3E7DE' } }, x: { grid: { display: false } } } } });
}

function renderActivity(){
  const el = document.getElementById('activityList');
  if(activity.length===0){ el.innerHTML = '<p class="empty" style="padding:6px 0;"><svg class="icon"><use href="#icon-sprout"/></svg>Chưa có hoạt động nào.</p>'; return; }
  el.innerHTML = activity.map(a=>`
    <div class="activity-item">
      <span class="adot"></span>
      <div><div class="atext">${a.text}</div><div class="atime">${relTime(a.ts)}</div></div>
    </div>`).join('');
}

function safeRender(fn, label){
  try{ fn(); }
  catch(e){ console.error('Lỗi hiển thị (' + (label||fn.name) + '):', e); }
}
function renderAll(){
  safeRender(renderAuthArea); safeRender(renderPersonAuthArea); safeRender(renderStatsGrid); safeRender(renderTable); safeRender(renderChart);
  safeRender(renderHouseholds); safeRender(renderWardSummary); safeRender(renderActivity);
  safeRender(renderQuality); safeRender(renderOutputs); safeRender(renderProcurements); safeRender(renderProducts);
}

/* ============ Kiểm định chất lượng ============ */
function seasonLabel(id){ if(!id) return '—'; const s = seasons.find(x=>x.id===Number(id)); return s ? s.name : '—'; }
const CERT_STANDARDS = ['VietGAP / Nội địa', 'Siêu thị trong nước', 'Xuất khẩu (GlobalGAP/MRL quốc tế)'];
function seasonCertStatus(seasonId, standard){
  const tests = qualityTests.filter(q=>q.seasonId===seasonId && q.standard===standard);
  if(tests.length===0) return 'none';
  if(tests.some(t=>t.result==='fail')) return 'fail';
  if(tests.some(t=>t.result==='pending')) return 'pending';
  return 'pass';
}
function certChip(status){
  return status==='pass' ? '<span class="chip chip-pass">Đạt</span>'
    : status==='fail' ? '<span class="chip chip-fail">Chưa đạt</span>'
    : status==='pending' ? '<span class="chip chip-pending">Chờ kết quả</span>'
    : '<span class="chip" style="background:#EEE;color:var(--ink-faint);">Chưa kiểm định</span>';
}
function renderCertTable(){
  const body = document.getElementById('certTableBody');
  if(seasons.length===0){ body.innerHTML = emptyRow(4, 'Chưa có mùa vụ nào.'); return; }
  body.innerHTML = seasons.map(s=>`
    <tr>
      <td>${s.name}</td>
      <td>${certChip(seasonCertStatus(s.id, 'VietGAP / Nội địa'))}</td>
      <td>${certChip(seasonCertStatus(s.id, 'Siêu thị trong nước'))}</td>
      <td>${certChip(seasonCertStatus(s.id, 'Xuất khẩu (GlobalGAP/MRL quốc tế)'))}</td>
    </tr>`).join('');
}
function resultChip(r){
  return r==='pass' ? '<span class="chip chip-pass">Đạt</span>'
    : r==='fail' ? '<span class="chip chip-fail">Không đạt</span>'
    : '<span class="chip chip-pending">Chờ kết quả</span>';
}
function renderQualityStats(){
  const total = qualityTests.length;
  const passCount = qualityTests.filter(q=>q.result==='pass').length;
  const failCount = qualityTests.filter(q=>q.result==='fail').length;
  const pendingCount = qualityTests.filter(q=>q.result==='pending').length;
  const rate = total>0 ? Math.round((passCount/total)*100) : 0;
  const exportPassCount = seasons.filter(s=>seasonCertStatus(s.id,'Xuất khẩu (GlobalGAP/MRL quốc tế)')==='pass').length;
  const supermarketPassCount = seasons.filter(s=>seasonCertStatus(s.id,'Siêu thị trong nước')==='pass').length;
  document.getElementById('qualityStats').innerHTML = `
    <div class="stat-card" style="--accent:var(--paddy)"><div class="num-face">${total}</div><div class="lbl">Lượt kiểm định</div></div>
    <div class="stat-card" style="--accent:var(--paddy-deep)"><div class="num-face">${rate}%</div><div class="lbl">Tỷ lệ đạt (mọi chuẩn)</div></div>
    <div class="stat-card" style="--accent:var(--danger)"><div class="num-face">${failCount}</div><div class="lbl">Không đạt — cần xử lý</div></div>
    <div class="stat-card" style="--accent:var(--papaya)"><div class="num-face">${pendingCount}</div><div class="lbl">Đang chờ kết quả</div></div>
    <div class="stat-card" style="--accent:var(--river)"><div class="num-face">${supermarketPassCount}/${seasons.length}</div><div class="lbl">Mùa vụ đạt chuẩn siêu thị</div></div>
    <div class="stat-card" style="--accent:var(--bloom)"><div class="num-face">${exportPassCount}/${seasons.length}</div><div class="lbl">Mùa vụ đạt chuẩn xuất khẩu</div></div>`;
}
function currentFilteredQuality(){
  const filter = document.getElementById('filterQualityResult').value;
  const std = document.getElementById('filterQualityStandard').value;
  const q = document.getElementById('searchQuality').value.trim().toLowerCase();
  let list = filter==='all' ? qualityTests : qualityTests.filter(x=>x.result===filter);
  if(std!=='all') list = list.filter(x=>x.standard===std);
  if(q){
    list = list.filter(x => seasonLabel(x.seasonId).toLowerCase().includes(q) ||
      (x.metric||'').toLowerCase().includes(q) || (x.lab||'').toLowerCase().includes(q));
  }
  return list;
}
function renderQuality(){
  renderQualityStats();
  renderCertTable();
  const list = currentFilteredQuality();
  const body = document.getElementById('qualityTableBody');
  if(list.length===0){ body.innerHTML = emptyRow(9, 'Chưa có dữ liệu kiểm định phù hợp.'); return; }
  body.innerHTML = list.map(q=>{
    const pct = q.threshold ? Math.min(150, Math.round((Number(q.value||0)/Number(q.threshold))*100)) : 0;
    const barColor = q.result==='fail' ? 'var(--danger)' : q.result==='pending' ? 'var(--papaya)' : 'var(--paddy)';
    return `
      <tr>
        <td>${seasonLabel(q.seasonId)}</td>
        <td>${q.metric}</td>
        <td>${q.standard||'—'}</td>
        <td>${q.value}${q.unit ? ' '+q.unit : ''}
          <div class="metric-bar"><div class="metric-bar-fill" style="width:${Math.min(100,pct)}%;background:${barColor}"></div></div>
        </td>
        <td>${q.threshold ? q.threshold + (q.unit ? ' '+q.unit : '') : '—'}</td>
        <td>${q.date||''}</td>
        <td>${q.lab||''}</td>
        <td>${resultChip(q.result)}</td>
        <td class="row-actions">
          ${canManage(seasonRegion(q.seasonId)) ? `<button class="btn btn-sm" onclick="openQualityForm(${q.id})">Sửa</button>
            <button class="btn btn-sm btn-danger" onclick="deleteQualityTest(${q.id})">Xóa</button>` : ''}
        </td>
      </tr>`;
  }).join('');
}
function openQualityForm(id){
  if(id && !canManage(seasonRegion(qualityTests.find(x=>x.id===id)?.seasonId))){ toast('Bạn không có quyền sửa lần kiểm định này', 'warn'); return; }
  document.getElementById('qualityOverlay').classList.add('show');
  const seasonSelect = document.getElementById('q_season');
  const allowedSeasons = seasons.filter(s=>canManage(s.region));
  seasonSelect.innerHTML = allowedSeasons.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  if(id){
    const q = qualityTests.find(x=>x.id===id);
    document.getElementById('qualityFormTitle').textContent = 'Sửa lần kiểm định';
    document.getElementById('q_editId').value = id;
    seasonSelect.value = q.seasonId || '';
    document.getElementById('q_metric').value = q.metric;
    document.getElementById('q_value').value = q.value;
    document.getElementById('q_unit').value = q.unit || '';
    document.getElementById('q_standard').value = q.standard || 'VietGAP / Nội địa';
    document.getElementById('q_threshold').value = q.threshold || '';
    document.getElementById('q_date').value = q.date || '';
    document.getElementById('q_lab').value = q.lab || '';
    document.getElementById('q_result').value = q.result;
    document.getElementById('q_note').value = q.note || '';
  }else{
    document.getElementById('qualityFormTitle').textContent = 'Thêm lần kiểm định';
    document.getElementById('q_editId').value = '';
    ['q_metric','q_value','q_unit','q_threshold','q_date','q_lab','q_note'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('q_standard').value = 'VietGAP / Nội địa';
    document.getElementById('q_result').value = 'pending';
  }
}
function closeQualityForm(){ document.getElementById('qualityOverlay').classList.remove('show'); }
async function saveQualityForm(){
  const id = document.getElementById('q_editId').value;
  const record = {
    seasonId: document.getElementById('q_season').value ? Number(document.getElementById('q_season').value) : null,
    metric: document.getElementById('q_metric').value.trim(),
    value: Number(document.getElementById('q_value').value||0),
    unit: document.getElementById('q_unit').value.trim(),
    standard: document.getElementById('q_standard').value,
    threshold: Number(document.getElementById('q_threshold').value||0),
    date: document.getElementById('q_date').value,
    lab: document.getElementById('q_lab').value.trim(),
    result: document.getElementById('q_result').value,
    note: document.getElementById('q_note').value.trim()
  };
  if(!canManage(seasonRegion(record.seasonId))){ toast('Bạn không có quyền với mùa vụ này', 'warn'); return; }
  if(!record.metric){ alert('Vui lòng nhập chỉ tiêu kiểm nghiệm.'); return; }
  if(id){ const idx = qualityTests.findIndex(x=>x.id===Number(id)); qualityTests[idx] = { ...qualityTests[idx], ...record }; }
  else{ const newId = qualityTests.length ? Math.max(...qualityTests.map(x=>x.id))+1 : 1; qualityTests.push({ id: newId, ...record }); }
  await saveQualityTests();
  await logActivity((id ? 'Cập nhật kiểm định: ' : 'Thêm lần kiểm định mới: ') + record.metric + ' (' + seasonLabel(record.seasonId) + ') — bởi ' + currentUser.user);
  closeQualityForm(); renderAll(); toast('Đã lưu kết quả kiểm định', 'ok');
}
async function deleteQualityTest(id){
  const q = qualityTests.find(x=>x.id===id);
  if(!canManage(seasonRegion(q?.seasonId))){ toast('Bạn không có quyền xóa lần kiểm định này', 'warn'); return; }
  if(!confirm('Xóa lần kiểm định này?')) return;
  qualityTests = qualityTests.filter(x=>x.id!==id);
  await saveQualityTests();
  await logActivity('Xóa lần kiểm định: ' + (q ? q.metric : '') + ' — bởi ' + currentUser.user);
  renderAll(); toast('Đã xóa lần kiểm định', 'warn');
}

/* ============ Đầu ra cho nguồn hàng ============ */
function outputStatusChip(s){
  return s==='done' ? '<span class="chip chip-out-done">Đã giao hàng</span>'
    : s==='negotiating' ? '<span class="chip chip-out-negotiating">Đang đàm phán</span>'
    : '<span class="chip chip-out-cancelled">Đã hủy</span>';
}
function outputRevenue(o){ return Number(o.volume||0) * 1000 * Number(o.price||0); }
function renderOutputStats(){
  const doneList = outputs.filter(o=>o.status==='done');
  const totalVolume = doneList.reduce((a,o)=>a+Number(o.volume||0),0);
  const totalRevenue = doneList.reduce((a,o)=>a+outputRevenue(o),0);
  const buyerCount = new Set(outputs.map(o=>o.buyer)).size;
  const negotiating = outputs.filter(o=>o.status==='negotiating').length;
  document.getElementById('outputStats').innerHTML = `
    <div class="stat-card" style="--accent:var(--river)"><div class="num-face">${money(totalVolume)}</div><div class="lbl">Tấn đã tiêu thụ</div></div>
    <div class="stat-card" style="--accent:var(--paddy-deep)"><div class="num-face">${(totalRevenue/1000000).toLocaleString('vi-VN',{maximumFractionDigits:1})}tr</div><div class="lbl">Doanh thu đã thực hiện</div></div>
    <div class="stat-card" style="--accent:var(--bloom)"><div class="num-face">${buyerCount}</div><div class="lbl">Đối tác thu mua</div></div>
    <div class="stat-card" style="--accent:var(--papaya)"><div class="num-face">${negotiating}</div><div class="lbl">Đang đàm phán</div></div>`;
}
function currentFilteredOutputs(){
  const filter = document.getElementById('filterOutputStatus').value;
  const q = document.getElementById('searchOutput').value.trim().toLowerCase();
  let list = filter==='all' ? outputs : outputs.filter(x=>x.status===filter);
  if(q){
    list = list.filter(x => seasonLabel(x.seasonId).toLowerCase().includes(q) ||
      (x.buyer||'').toLowerCase().includes(q) || (x.channel||'').toLowerCase().includes(q));
  }
  return list;
}
function renderOutputs(){
  renderOutputStats();
  const list = currentFilteredOutputs();
  const body = document.getElementById('outputTableBody');
  if(list.length===0){ body.innerHTML = emptyRow(9, 'Chưa có dữ liệu đầu ra phù hợp.'); return; }
  body.innerHTML = list.map(o=>`
    <tr>
      <td>${seasonLabel(o.seasonId)}</td><td>${o.buyer}</td><td>${o.channel}</td><td>${o.volume}</td>
      <td>${o.price ? money(o.price) : '—'}</td><td>${outputRevenue(o) ? money(outputRevenue(o)) : '—'}</td>
      <td>${o.date||''}</td><td>${outputStatusChip(o.status)}</td>
      <td class="row-actions">
        ${canManage(seasonRegion(o.seasonId)) ? `<button class="btn btn-sm" onclick="openOutputForm(${o.id})">Sửa</button>
          <button class="btn btn-sm btn-danger" onclick="deleteOutput(${o.id})">Xóa</button>` : ''}
      </td>
    </tr>`).join('');
}
function openOutputForm(id){
  if(id && !canManage(seasonRegion(outputs.find(x=>x.id===id)?.seasonId))){ toast('Bạn không có quyền sửa mục đầu ra này', 'warn'); return; }
  document.getElementById('outputOverlay').classList.add('show');
  const seasonSelect = document.getElementById('o_season');
  const allowedSeasons = seasons.filter(s=>canManage(s.region));
  seasonSelect.innerHTML = allowedSeasons.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  if(id){
    const o = outputs.find(x=>x.id===id);
    document.getElementById('outputFormTitle').textContent = 'Sửa đầu ra';
    document.getElementById('o_editId').value = id;
    seasonSelect.value = o.seasonId || '';
    document.getElementById('o_buyer').value = o.buyer;
    document.getElementById('o_channel').value = o.channel;
    document.getElementById('o_volume').value = o.volume;
    document.getElementById('o_price').value = o.price || '';
    document.getElementById('o_date').value = o.date || '';
    document.getElementById('o_status').value = o.status;
    document.getElementById('o_note').value = o.note || '';
  }else{
    document.getElementById('outputFormTitle').textContent = 'Thêm đầu ra';
    document.getElementById('o_editId').value = '';
    ['o_buyer','o_volume','o_price','o_date','o_note'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('o_channel').value = 'Chợ đầu mối';
    document.getElementById('o_status').value = 'negotiating';
  }
}
function closeOutputForm(){ document.getElementById('outputOverlay').classList.remove('show'); }
async function saveOutputForm(){
  const id = document.getElementById('o_editId').value;
  const record = {
    seasonId: document.getElementById('o_season').value ? Number(document.getElementById('o_season').value) : null,
    buyer: document.getElementById('o_buyer').value.trim(),
    channel: document.getElementById('o_channel').value,
    volume: Number(document.getElementById('o_volume').value||0),
    price: Number(document.getElementById('o_price').value||0),
    date: document.getElementById('o_date').value,
    status: document.getElementById('o_status').value,
    note: document.getElementById('o_note').value.trim()
  };
  if(!canManage(seasonRegion(record.seasonId))){ toast('Bạn không có quyền với mùa vụ này', 'warn'); return; }
  if(!record.buyer){ alert('Vui lòng nhập tên đối tác thu mua.'); return; }
  if(id){ const idx = outputs.findIndex(x=>x.id===Number(id)); outputs[idx] = { ...outputs[idx], ...record }; }
  else{ const newId = outputs.length ? Math.max(...outputs.map(x=>x.id))+1 : 1; outputs.push({ id: newId, ...record }); }
  await saveOutputs();
  await logActivity((id ? 'Cập nhật đầu ra: ' : 'Thêm đầu ra mới: ') + record.buyer + ' (' + seasonLabel(record.seasonId) + ') — bởi ' + currentUser.user);
  closeOutputForm(); renderAll(); toast('Đã lưu thông tin đầu ra', 'ok');
}
async function deleteOutput(id){
  const o = outputs.find(x=>x.id===id);
  if(!canManage(seasonRegion(o?.seasonId))){ toast('Bạn không có quyền xóa mục đầu ra này', 'warn'); return; }
  if(!confirm('Xóa mục đầu ra này?')) return;
  outputs = outputs.filter(x=>x.id!==id);
  await saveOutputs();
  await logActivity('Xóa đầu ra: ' + (o ? o.buyer : '') + ' — bởi ' + currentUser.user);
  renderAll(); toast('Đã xóa mục đầu ra', 'warn');
}

/* ============ Tin thu mua (dạng "tin tuyển dụng" cho hộ kinh doanh tìm đầu ra) ============ */
function procStatusChip(s){
  return s==='open' ? '<span class="chip chip-open">Đang tuyển đầu mối</span>' : '<span class="chip chip-closed">Đã đủ nguồn hàng</span>';
}
function daysLeftLabel(deadline){
  if(!deadline) return '';
  const d = new Date(deadline + 'T00:00:00'); const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((d-now)/86400000);
  if(diff < 0) return 'Đã hết hạn';
  if(diff === 0) return 'Hạn hôm nay';
  return 'Còn ' + diff + ' ngày';
}
function renderProcStats(){
  const openCount = procurements.filter(p=>p.status==='open').length;
  const totalApplicants = procurements.reduce((a,p)=>a+(p.applicants||[]).length,0);
  const cropSet = new Set(procurements.map(p=>p.crop)).size;
  const totalQuantity = procurements.filter(p=>p.status==='open').reduce((a,p)=>a+Number(p.quantity||0),0);
  document.getElementById('procStats').innerHTML = `
    <div class="stat-card" style="--accent:var(--paddy)"><div class="num-face">${openCount}</div><div class="lbl">Tin đang tuyển đầu mối</div></div>
    <div class="stat-card" style="--accent:var(--river)"><div class="num-face">${money(totalQuantity)}</div><div class="lbl">Tổng nhu cầu đang mở (đơn vị hỗn hợp)</div></div>
    <div class="stat-card" style="--accent:var(--bloom)"><div class="num-face">${totalApplicants}</div><div class="lbl">Lượt hộ trồng đã gửi chào hàng</div></div>
    <div class="stat-card" style="--accent:var(--papaya)"><div class="num-face">${cropSet}</div><div class="lbl">Loại cây trồng đang có nhu cầu</div></div>`;
}
function currentFilteredProcurements(){
  const filterEl = document.getElementById('filterProcCrop');
  const currentCrop = filterEl.value || 'all';
  const crops = Array.from(new Set(procurements.map(p=>p.crop))).sort();
  filterEl.innerHTML = '<option value="all">Tất cả cây trồng</option>' + crops.map(c=>`<option value="${c}" ${c===currentCrop?'selected':''}>${c}</option>`).join('');
  if(!Array.from(filterEl.options).some(o=>o.value===currentCrop)) filterEl.value = 'all';
  const filter = document.getElementById('filterProcStatus').value;
  const cropFilter = filterEl.value;
  const q = document.getElementById('searchProc').value.trim().toLowerCase();
  let list = filter==='all' ? procurements : procurements.filter(p=>p.status===filter);
  if(cropFilter!=='all') list = list.filter(p=>p.crop===cropFilter);
  if(q){
    list = list.filter(p => (p.title||'').toLowerCase().includes(q) || (p.crop||'').toLowerCase().includes(q) ||
      (p.buyer||'').toLowerCase().includes(q) || (p.ap||'').toLowerCase().includes(q));
  }
  return [...list].sort((a,b)=> (a.status==='open'?0:1) - (b.status==='open'?0:1) || (b.postedDate||'').localeCompare(a.postedDate||''));
}
function renderProcurements(){
  renderProcStats();
  const list = currentFilteredProcurements();
  const el = document.getElementById('procList');
  if(list.length===0){ el.innerHTML = `<div class="panel empty"><svg class="icon"><use href="#icon-sprout"/></svg>Chưa có tin thu mua phù hợp.</div>`; return; }
  el.innerHTML = list.map(p=>{
    const canEdit = canManageProc(p);
    const applicants = p.applicants || [];
    return `
    <div class="proc-card ${p.status==='closed'?'closed':''}">
      <div class="proc-top">
        <div>
          <p class="proc-title">${p.title}</p>
          <p class="proc-buyer">${p.buyer}${p.postedDate ? ' · đăng ngày '+p.postedDate : ''}</p>
        </div>
        <div class="proc-status">${procStatusChip(p.status)}</div>
      </div>
      <div class="proc-tags">
        <span class="proc-tag accent-river"><svg class="icon" style="width:13px;height:13px;margin-right:3px;"><use href="#icon-seasons"/></svg>${p.crop}</span>
        <span class="proc-tag accent-papaya">${p.quantity} ${p.unitLabel||'tấn'}</span>
        ${p.priceOffer ? `<span class="proc-tag accent-bloom">${money(p.priceOffer)} đ/kg</span>` : `<span class="proc-tag">Giá thỏa thuận</span>`}
        <span class="proc-tag">${p.ap}</span>
        ${p.deadline ? `<span class="proc-tag">${daysLeftLabel(p.deadline)} (đến ${p.deadline})</span>` : ''}
      </div>
      ${p.requirement ? `<div class="proc-req"><svg class="icon" style="width:14px;height:14px;"><use href="#icon-quality"/></svg>${p.requirement}</div>` : ''}
      ${p.note ? `<div class="proc-note">${p.note}</div>` : ''}
      <div class="proc-bottom">
        <div class="proc-meta">Liên hệ: ${p.contactName||'—'}${p.contactPhone ? ' · '+p.contactPhone : ''} · ${applicants.length} hộ đã gửi chào hàng</div>
        <div class="proc-actions">
          <button class="btn btn-primary btn-sm" onclick="openApplyForm(${p.id})" ${p.status==='closed'?'disabled':''}>Gửi chào hàng</button>
          ${applicants.length>0 ? `<button class="btn btn-sm" onclick="toggleApplicants(${p.id})">Xem hộ đã gửi chào hàng</button>` : ''}
          ${canEdit ? `<button class="btn btn-sm" onclick="openProcForm(${p.id})">Sửa</button>
            <button class="btn btn-sm" onclick="toggleProcStatus(${p.id})">${p.status==='open'?'Đánh dấu đã đủ hàng':'Mở lại tin'}</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProcurement(${p.id})">Xóa</button>` : ''}
        </div>
      </div>
      <div class="applicants-box" id="applicants-${p.id}">
        ${applicants.map(a=>`<div class="applicant-item"><strong>${a.name}</strong> · ${a.phone||'—'} ${a.ap?'· '+a.ap:''}${a.quantity?' · có thể cung cấp: '+a.quantity:''}${a.note?' · '+a.note:''}</div>`).join('') || ''}
      </div>
    </div>`;
  }).join('');
}
function toggleApplicants(id){
  const box = document.getElementById('applicants-'+id);
  if(box) box.classList.toggle('show');
}
function openProcForm(id){
  if(id && !canManageProc(procurements.find(x=>x.id===id))){
    toast('Bạn không có quyền sửa tin thu mua này', 'warn'); return;
  }
  document.getElementById('procOverlay').classList.add('show');
  if(id){
    const p = procurements.find(x=>x.id===id);
    document.getElementById('procFormTitle').textContent = 'Sửa tin thu mua';
    document.getElementById('p_editId').value = id;
    document.getElementById('p_title').value = p.title;
    document.getElementById('p_buyer').value = p.buyer;
    document.getElementById('p_crop').value = p.crop;
    document.getElementById('p_ap').value = p.ap;
    document.getElementById('p_quantity').value = p.quantity;
    document.getElementById('p_unitLabel').value = p.unitLabel || '';
    document.getElementById('p_priceOffer').value = p.priceOffer || '';
    document.getElementById('p_requirement').value = p.requirement || '';
    document.getElementById('p_deadline').value = p.deadline || '';
    document.getElementById('p_contactName').value = p.contactName || '';
    document.getElementById('p_contactPhone').value = p.contactPhone || '';
    document.getElementById('p_note').value = p.note || '';
    document.getElementById('p_status').value = p.status;
  }else{
    document.getElementById('procFormTitle').textContent = 'Đăng tin thu mua';
    document.getElementById('p_editId').value = '';
    ['p_title','p_buyer','p_crop','p_ap','p_quantity','p_unitLabel','p_priceOffer','p_requirement','p_deadline','p_contactName','p_contactPhone','p_note'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('p_status').value = 'open';
    if(currentUser && currentUser.role==='ward') document.getElementById('p_ap').value = currentUser.ap;
    if(currentPersonUser && currentPersonUser.role==='buyer'){
      document.getElementById('p_buyer').value = currentPersonUser.displayName;
      document.getElementById('p_contactName').value = currentPersonUser.displayName;
      document.getElementById('p_contactPhone').value = currentPersonUser.phone || '';
    }
  }
}
function closeProcForm(){ document.getElementById('procOverlay').classList.remove('show'); }
async function saveProcForm(){
  const id = document.getElementById('p_editId').value;
  const record = {
    title: document.getElementById('p_title').value.trim(),
    buyer: document.getElementById('p_buyer').value.trim(),
    crop: document.getElementById('p_crop').value.trim(),
    ap: document.getElementById('p_ap').value.trim(),
    quantity: Number(document.getElementById('p_quantity').value||0),
    unitLabel: document.getElementById('p_unitLabel').value.trim() || 'tấn',
    priceOffer: Number(document.getElementById('p_priceOffer').value||0),
    requirement: document.getElementById('p_requirement').value.trim(),
    deadline: document.getElementById('p_deadline').value,
    contactName: document.getElementById('p_contactName').value.trim(),
    contactPhone: document.getElementById('p_contactPhone').value.trim(),
    note: document.getElementById('p_note').value.trim(),
    status: document.getElementById('p_status').value
  };
  if(!record.title || !record.buyer){ alert('Vui lòng nhập tiêu đề tin và tên đối tác thu mua.'); return; }
  if(id){
    const idx = procurements.findIndex(x=>x.id===Number(id));
    procurements[idx] = { ...procurements[idx], ...record };
  }else{
    const newId = procurements.length ? Math.max(...procurements.map(x=>x.id))+1 : 1;
    const ownerUsername = (currentPersonUser && currentPersonUser.role==='buyer') ? currentPersonUser.username : null;
    procurements.push({ id: newId, postedDate: new Date().toISOString().slice(0,10), applicants: [], ownerUsername, ...record });
  }
  await saveProcurements();
  await logActivity((id ? 'Cập nhật tin thu mua: ' : 'Đăng tin thu mua mới: ') + record.title + ' — bởi ' + actorLabel());
  closeProcForm(); renderAll(); toast('Đã lưu tin thu mua', 'ok');
}
async function toggleProcStatus(id){
  const p = procurements.find(x=>x.id===id);
  if(!p || !canManageProc(p)){ toast('Bạn không có quyền với tin này', 'warn'); return; }
  p.status = p.status==='open' ? 'closed' : 'open';
  await saveProcurements();
  await logActivity((p.status==='closed' ? 'Đóng tin thu mua (đã đủ nguồn hàng): ' : 'Mở lại tin thu mua: ') + p.title + ' — bởi ' + actorLabel());
  renderAll(); toast('Đã cập nhật trạng thái tin', 'ok');
}
async function deleteProcurement(id){
  const p = procurements.find(x=>x.id===id);
  if(!p || !canManageProc(p)){ toast('Bạn không có quyền xóa tin này', 'warn'); return; }
  if(!confirm('Xóa tin thu mua này?')) return;
  procurements = procurements.filter(x=>x.id!==id);
  await saveProcurements();
  await logActivity('Xóa tin thu mua: ' + (p ? p.title : '') + ' — bởi ' + actorLabel());
  renderAll(); toast('Đã xóa tin thu mua', 'warn');
}

/* Gửi chào hàng / liên hệ — mở cho mọi hộ kinh doanh, không cần đăng nhập admin */
function openApplyForm(id){
  const p = procurements.find(x=>x.id===id);
  if(!p) return;
  document.getElementById('applyError').style.display='none';
  document.getElementById('ap_procId').value = id;
  document.getElementById('applyForTitle').textContent = 'Gửi thông tin chào hàng cho: "' + p.title + '" — ' + p.buyer;
  ['ap_name','ap_phone','ap_ap','ap_quantity','ap_note'].forEach(fid=>document.getElementById(fid).value='');
  if(currentUser && currentUser.role==='ward') document.getElementById('ap_ap').value = currentUser.ap;
  document.getElementById('applyOverlay').classList.add('show');
}
function closeApplyForm(){ document.getElementById('applyOverlay').classList.remove('show'); }
async function submitApplication(){
  const id = Number(document.getElementById('ap_procId').value);
  const p = procurements.find(x=>x.id===id);
  if(!p) return;
  const name = document.getElementById('ap_name').value.trim();
  const phone = document.getElementById('ap_phone').value.trim();
  if(!name || !phone){ document.getElementById('applyError').style.display='block'; return; }
  const applicant = {
    name, phone,
    ap: document.getElementById('ap_ap').value.trim(),
    quantity: document.getElementById('ap_quantity').value.trim(),
    note: document.getElementById('ap_note').value.trim(),
    ts: Date.now()
  };
  p.applicants = p.applicants || [];
  p.applicants.push(applicant);
  await saveProcurements();
  await logActivity('Hộ trồng "' + name + '" đã gửi chào hàng/liên hệ cho tin: ' + p.title);
  closeApplyForm(); renderAll();
  toast('Đã gửi thông tin chào hàng, đối tác sẽ liên hệ lại với bạn', 'ok');
}

/* ============ Sản phẩm đang bán (cho quán ăn, chợ, tiểu thương xem và mua) ============ */
function certChipProduct(cert){
  if(cert === 'VietGAP') return '<span class="chip chip-pass">VietGAP</span>';
  if(cert === 'Xuất khẩu (GlobalGAP)') return '<span class="chip" style="background:var(--bloom-tint);color:var(--bloom-deep);">Xuất khẩu (GlobalGAP)</span>';
  return '<span class="chip" style="background:#EEE;color:var(--ink-faint);">Chưa kiểm định</span>';
}
function productStatusChip(s){
  return s==='available' ? '<span class="chip chip-open">Còn hàng</span>' : '<span class="chip chip-closed">Hết hàng</span>';
}
function renderProductStats(){
  const availableCount = products.filter(p=>p.status==='available').length;
  const certCount = products.filter(p=>p.certification && p.certification!=='Chưa kiểm định').length;
  const buyerCount = products.reduce((a,p)=>a+(p.buyRequests||[]).length,0);
  const typeCount = new Set(products.map(p=>p.name)).size;
  document.getElementById('productStats').innerHTML = `
    <div class="stat-card" style="--accent:var(--paddy)"><div class="num-face">${availableCount}</div><div class="lbl">Sản phẩm còn hàng</div></div>
    <div class="stat-card" style="--accent:var(--bloom)"><div class="num-face">${typeCount}</div><div class="lbl">Loại rau đang bán</div></div>
    <div class="stat-card" style="--accent:var(--river)"><div class="num-face">${certCount}</div><div class="lbl">Sản phẩm có chứng chỉ</div></div>
    <div class="stat-card" style="--accent:var(--papaya)"><div class="num-face">${buyerCount}</div><div class="lbl">Lượt quán/chợ liên hệ mua</div></div>`;
}
function currentFilteredProducts(){
  const nameFilterEl = document.getElementById('filterProductName');
  const currentName = nameFilterEl.value || 'all';
  const names = Array.from(new Set(products.map(p=>p.name))).sort();
  nameFilterEl.innerHTML = '<option value="all">Tất cả loại rau</option>' + names.map(n=>`<option value="${n}" ${n===currentName?'selected':''}>${n}</option>`).join('');
  if(!Array.from(nameFilterEl.options).some(o=>o.value===currentName)) nameFilterEl.value = 'all';
  const nameFilter = nameFilterEl.value;
  const certFilter = document.getElementById('filterProductCert').value;
  const q = document.getElementById('searchProduct').value.trim().toLowerCase();
  let list = [...products];
  if(nameFilter!=='all') list = list.filter(p=>p.name===nameFilter);
  if(certFilter!=='all') list = list.filter(p=>p.certification===certFilter);
  if(q){
    list = list.filter(p => (p.name||'').toLowerCase().includes(q) || (p.sellerName||'').toLowerCase().includes(q) || (p.ap||'').toLowerCase().includes(q));
  }
  return list.sort((a,b)=> (a.status==='available'?0:1) - (b.status==='available'?0:1) || (b.postedDate||'').localeCompare(a.postedDate||''));
}
function renderProducts(){
  renderProductStats();
  const list = currentFilteredProducts();
  const el = document.getElementById('productList');
  if(list.length===0){ el.innerHTML = `<div class="panel empty"><svg class="icon"><use href="#icon-sprout"/></svg>Chưa có sản phẩm nào đang bán.</div>`; return; }
  el.innerHTML = list.map(p=>{
    const canEdit = canManageProduct(p);
    const buyers = p.buyRequests || [];
    return `
    <div class="proc-card ${p.status==='soldout'?'closed':''}">
      <div class="proc-top">
        <div>
          <p class="proc-title">${p.name}</p>
          <p class="proc-buyer">Người bán: ${p.sellerName||'—'}${p.postedDate ? ' · đăng ngày '+p.postedDate : ''}</p>
        </div>
        <div class="proc-status">${productStatusChip(p.status)}</div>
      </div>
      <div class="proc-tags">
        ${certChipProduct(p.certification)}
        <span class="proc-tag accent-papaya">${p.quantity} ${p.unitLabel||'kg'} còn lại</span>
        <span class="proc-tag accent-bloom">${money(p.price)} đ/${p.unitLabel||'kg'}</span>
        <span class="proc-tag">${p.ap}</span>
      </div>
      ${p.note ? `<div class="proc-note">${p.note}</div>` : ''}
      <div class="proc-bottom">
        <div class="proc-meta">Liên hệ: ${p.contactName||'—'}${p.contactPhone ? ' · '+p.contactPhone : ''} · ${buyers.length} lượt liên hệ mua</div>
        <div class="proc-actions">
          <button class="btn btn-primary btn-sm" onclick="openBuyForm(${p.id})" ${p.status==='soldout'?'disabled':''}>Liên hệ mua</button>
          ${buyers.length>0 ? `<button class="btn btn-sm" onclick="toggleBuyers(${p.id})">Xem người đã liên hệ</button>` : ''}
          ${canEdit ? `<button class="btn btn-sm" onclick="openProductForm(${p.id})">Sửa</button>
            <button class="btn btn-sm" onclick="toggleProductStatus(${p.id})">${p.status==='available'?'Đánh dấu hết hàng':'Mở bán lại'}</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})">Xóa</button>` : ''}
        </div>
      </div>
      <div class="applicants-box" id="buyers-${p.id}">
        ${buyers.map(b=>`<div class="applicant-item"><strong>${b.name}</strong> · ${b.phone||'—'}${b.quantity?' · muốn mua: '+b.quantity:''}${b.note?' · '+b.note:''}</div>`).join('') || ''}
      </div>
    </div>`;
  }).join('');
}
function toggleBuyers(id){
  const box = document.getElementById('buyers-'+id);
  if(box) box.classList.toggle('show');
}
function openProductForm(id){
  if(id && !canManageProduct(products.find(x=>x.id===id))){
    toast('Bạn không có quyền sửa sản phẩm này', 'warn'); return;
  }
  document.getElementById('productOverlay').classList.add('show');
  if(id){
    const p = products.find(x=>x.id===id);
    document.getElementById('productFormTitle').textContent = 'Sửa sản phẩm bán';
    document.getElementById('pr_editId').value = id;
    document.getElementById('pr_name').value = p.name;
    document.getElementById('pr_seller').value = p.sellerName || '';
    document.getElementById('pr_ap').value = p.ap;
    document.getElementById('pr_quantity').value = p.quantity;
    document.getElementById('pr_unitLabel').value = p.unitLabel || 'kg';
    document.getElementById('pr_price').value = p.price || '';
    document.getElementById('pr_certification').value = p.certification || 'Chưa kiểm định';
    document.getElementById('pr_contactName').value = p.contactName || '';
    document.getElementById('pr_contactPhone').value = p.contactPhone || '';
    document.getElementById('pr_note').value = p.note || '';
    document.getElementById('pr_status').value = p.status;
  }else{
    document.getElementById('productFormTitle').textContent = 'Đăng sản phẩm bán';
    document.getElementById('pr_editId').value = '';
    ['pr_name','pr_seller','pr_ap','pr_quantity','pr_price','pr_contactName','pr_contactPhone','pr_note'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('pr_unitLabel').value = 'kg';
    document.getElementById('pr_certification').value = 'Chưa kiểm định';
    document.getElementById('pr_status').value = 'available';
    if(currentUser && currentUser.role==='ward') document.getElementById('pr_ap').value = currentUser.ap;
  }
}
function closeProductForm(){ document.getElementById('productOverlay').classList.remove('show'); }
async function saveProductForm(){
  const id = document.getElementById('pr_editId').value;
  const record = {
    name: document.getElementById('pr_name').value.trim(),
    sellerName: document.getElementById('pr_seller').value.trim(),
    ap: document.getElementById('pr_ap').value.trim(),
    quantity: Number(document.getElementById('pr_quantity').value||0),
    unitLabel: document.getElementById('pr_unitLabel').value.trim() || 'kg',
    price: Number(document.getElementById('pr_price').value||0),
    certification: document.getElementById('pr_certification').value,
    contactName: document.getElementById('pr_contactName').value.trim(),
    contactPhone: document.getElementById('pr_contactPhone').value.trim(),
    note: document.getElementById('pr_note').value.trim(),
    status: document.getElementById('pr_status').value
  };
  if(!record.name){ alert('Vui lòng nhập tên rau/sản phẩm.'); return; }
  if(id){
    const idx = products.findIndex(x=>x.id===Number(id));
    products[idx] = { ...products[idx], ...record };
  }else{
    const newId = products.length ? Math.max(...products.map(x=>x.id))+1 : 1;
    products.push({ id: newId, postedDate: new Date().toISOString().slice(0,10), buyRequests: [], ...record });
  }
  await saveProducts();
  await logActivity((id ? 'Cập nhật sản phẩm bán: ' : 'Đăng sản phẩm bán mới: ') + record.name + ' — bởi ' + actorLabel());
  closeProductForm(); renderAll(); toast('Đã lưu sản phẩm', 'ok');
}
async function toggleProductStatus(id){
  const p = products.find(x=>x.id===id);
  if(!p || !canManageProduct(p)){ toast('Bạn không có quyền với sản phẩm này', 'warn'); return; }
  p.status = p.status==='available' ? 'soldout' : 'available';
  await saveProducts();
  await logActivity((p.status==='soldout' ? 'Đánh dấu hết hàng: ' : 'Mở bán lại: ') + p.name + ' — bởi ' + actorLabel());
  renderAll(); toast('Đã cập nhật trạng thái', 'ok');
}
async function deleteProduct(id){
  const p = products.find(x=>x.id===id);
  if(!p || !canManageProduct(p)){ toast('Bạn không có quyền xóa sản phẩm này', 'warn'); return; }
  if(!confirm('Xóa sản phẩm này?')) return;
  products = products.filter(x=>x.id!==id);
  await saveProducts();
  await logActivity('Xóa sản phẩm bán: ' + (p ? p.name : '') + ' — bởi ' + actorLabel());
  renderAll(); toast('Đã xóa sản phẩm', 'warn');
}

/* Liên hệ mua — mở cho quán ăn, chợ, tiểu thương, không cần đăng nhập */
function openBuyForm(id){
  const p = products.find(x=>x.id===id);
  if(!p) return;
  document.getElementById('buyError').style.display='none';
  document.getElementById('by_productId').value = id;
  document.getElementById('buyForTitle').textContent = 'Liên hệ mua "' + p.name + '" — người bán: ' + (p.sellerName||'—');
  ['by_name','by_phone','by_quantity','by_note'].forEach(fid=>document.getElementById(fid).value='');
  document.getElementById('buyOverlay').classList.add('show');
}
function closeBuyForm(){ document.getElementById('buyOverlay').classList.remove('show'); }
async function submitBuyRequest(){
  const id = Number(document.getElementById('by_productId').value);
  const p = products.find(x=>x.id===id);
  if(!p) return;
  const name = document.getElementById('by_name').value.trim();
  const phone = document.getElementById('by_phone').value.trim();
  if(!name || !phone){ document.getElementById('buyError').style.display='block'; return; }
  const request = {
    name, phone,
    quantity: document.getElementById('by_quantity').value.trim(),
    note: document.getElementById('by_note').value.trim(),
    ts: Date.now()
  };
  p.buyRequests = p.buyRequests || [];
  p.buyRequests.push(request);
  await saveProducts();
  await logActivity('"' + name + '" đã liên hệ mua: ' + p.name);
  closeBuyForm(); renderAll();
  toast('Đã gửi yêu cầu mua, người bán sẽ liên hệ lại với bạn', 'ok');
}

/* ============ Hộ trồng ============ */
function apOptionsHtml(selected){
  const aps = Array.from(new Set(households.map(h=>h.ap))).sort();
  return aps.map(ap=>`<option value="${ap}" ${ap===selected?'selected':''}>${ap}</option>`).join('');
}
function renderHouseholds(){
  const filterEl = document.getElementById('filterAp');
  const current = filterEl.value || 'all';
  filterEl.innerHTML = `<option value="all">Tất cả các ấp</option>` + apOptionsHtml(current==='all'?null:current);
  filterEl.value = Array.from(filterEl.options).some(o=>o.value===current) ? current : 'all';
  const filter = filterEl.value;
  const q = document.getElementById('searchHh').value.trim().toLowerCase();
  let list = filter==='all' ? households : households.filter(h=>h.ap===filter);
  if(q){ list = list.filter(h => (h.name||'').toLowerCase().includes(q) || (h.crop||'').toLowerCase().includes(q) || (h.note||'').toLowerCase().includes(q)); }
  const body = document.getElementById('hhTableBody');
  if(list.length===0){ body.innerHTML = emptyRow(8, 'Không tìm thấy hộ trồng phù hợp.'); return; }
  body.innerHTML = list.map(h=>`
    <tr>
      <td>${h.name}</td><td>${h.ap}</td><td>${h.crop}</td><td>${h.area}</td><td>${h.years||'—'}</td>
      <td>${h.phone||'—'}</td><td>${h.note||''}</td>
      <td class="row-actions">
        ${canManage(h.ap) ? `<button class="btn btn-sm" onclick="openHhForm(${h.id})">Sửa</button>
          <button class="btn btn-sm btn-danger" onclick="deleteHousehold(${h.id})">Xóa</button>` : ''}
      </td>
    </tr>`).join('');
}
function renderWardSummary(){
  const aps = Array.from(new Set(households.map(h=>h.ap))).sort();
  const colors = ['var(--paddy)','var(--river)','var(--papaya)','var(--bloom)'];
  const summary = aps.map(ap=>{
    const hhs = households.filter(h=>h.ap===ap);
    const totalArea = hhs.reduce((a,h)=>a+Number(h.area||0),0);
    const cropCount = {};
    hhs.forEach(h=>{ cropCount[h.crop] = (cropCount[h.crop]||0)+1; });
    const mainCrop = Object.keys(cropCount).sort((a,b)=>cropCount[b]-cropCount[a])[0] || '—';
    return { ap, count: hhs.length, totalArea, mainCrop };
  });
  document.getElementById('wardSummary').innerHTML = summary.map((s,i)=>`
    <div class="stat-card" style="--accent:${colors[i%colors.length]}">
      <svg class="icon"><use href="#icon-households"/></svg>
      <div class="num-face">${s.count}</div>
      <div class="lbl">Hộ trồng — ${s.ap}</div>
      <div class="lbl" style="margin-top:6px;">${money(s.totalArea)} ha · chủ lực: ${s.mainCrop}</div>
    </div>`).join('') || '<div class="stat-card empty"><svg class="icon"><use href="#icon-sprout"/></svg>Chưa có dữ liệu hộ trồng.</div>';
  const ctx = document.getElementById('wardAreaChart');
  if(!ctx) return;
  if(typeof Chart === 'undefined'){
    ctx.replaceWith(Object.assign(document.createElement('p'), { className:'empty', innerHTML:'<svg class="icon"><use href="#icon-sprout"/></svg>Không tải được thư viện biểu đồ (cần kết nối mạng lần đầu để tải Chart.js).' }));
    return;
  }
  if(wardChart) wardChart.destroy();
  wardChart = new Chart(ctx, { type: 'bar', data: { labels: summary.map(s=>s.ap),
    datasets: [{ label: 'Diện tích canh tác (ha)', data: summary.map(s=>s.totalArea), backgroundColor: '#1C7ED6', borderRadius: 6, maxBarThickness: 60 }] },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#E3E7DE' } }, x: { grid: { display: false } } } } });
}

function openHhForm(id){
  if(id && !canManage(households.find(x=>x.id===id)?.ap)){ toast('Bạn không có quyền sửa hộ trồng này', 'warn'); return; }
  document.getElementById('hhOverlay').classList.add('show');
  const apInput = document.getElementById('hh_ap');
  if(id){
    const h = households.find(x=>x.id===id);
    document.getElementById('hhFormTitle').textContent = 'Sửa hộ trồng';
    document.getElementById('hh_editId').value = id;
    document.getElementById('hh_name').value = h.name;
    apInput.value = h.ap;
    document.getElementById('hh_crop').value = h.crop;
    document.getElementById('hh_area').value = h.area;
    document.getElementById('hh_years').value = h.years || '';
    document.getElementById('hh_phone').value = h.phone || '';
    document.getElementById('hh_note').value = h.note || '';
  }else{
    document.getElementById('hhFormTitle').textContent = 'Thêm hộ trồng';
    document.getElementById('hh_editId').value = '';
    ['hh_name','hh_ap','hh_crop','hh_area','hh_years','hh_phone','hh_note'].forEach(id=>document.getElementById(id).value='');
    if(currentUser && currentUser.role==='ward') apInput.value = currentUser.ap;
  }
  apInput.disabled = !!(currentUser && currentUser.role==='ward');
}
function closeHhForm(){ document.getElementById('hhOverlay').classList.remove('show'); document.getElementById('hh_ap').disabled = false; }
async function saveHhForm(){
  const id = document.getElementById('hh_editId').value;
  const record = {
    name: document.getElementById('hh_name').value.trim(), ap: document.getElementById('hh_ap').value.trim(),
    crop: document.getElementById('hh_crop').value.trim(), area: Number(document.getElementById('hh_area').value||0),
    years: Number(document.getElementById('hh_years').value||0), phone: document.getElementById('hh_phone').value.trim(),
    note: document.getElementById('hh_note').value.trim()
  };
  if(currentUser && currentUser.role==='ward') record.ap = currentUser.ap; // khoá đúng ấp phụ trách
  if(!record.name || !record.ap){ alert('Vui lòng nhập tên chủ hộ và ấp.'); return; }
  if(id){
    if(!canManage(households.find(x=>x.id===Number(id))?.ap)){ toast('Bạn không có quyền sửa hộ trồng này', 'warn'); return; }
    const idx = households.findIndex(x=>x.id===Number(id)); households[idx] = { ...households[idx], ...record };
  }
  else{ const newId = households.length ? Math.max(...households.map(h=>h.id))+1 : 1; households.push({ id: newId, ...record }); }
  await saveHouseholds();
  await logActivity((id ? 'Cập nhật hộ trồng: ' : 'Thêm hộ trồng mới: ') + record.name + ' — bởi ' + currentUser.user);
  closeHhForm(); renderAll(); toast('Đã lưu hộ trồng', 'ok');
}
async function deleteHousehold(id){
  const h = households.find(x=>x.id===id);
  if(!canManage(h?.ap)){ toast('Bạn không có quyền xóa hộ trồng này', 'warn'); return; }
  if(!confirm('Xóa hộ trồng này? (các mùa vụ đang liên kết sẽ chuyển về "Không xác định")')) return;
  households = households.filter(x=>x.id!==id);
  seasons.forEach(s=>{ if(s.householdId===id) s.householdId = null; });
  await saveHouseholds(); await saveSeasons();
  await logActivity('Xóa hộ trồng: ' + (h ? h.name : '') + ' — bởi ' + currentUser.user);
  renderAll(); toast('Đã xóa hộ trồng', 'warn');
}

/* ============ Đăng nhập admin ============ */
function openLogin(){
  document.getElementById('loginError').style.display='none';
  document.getElementById('loginUser').value=''; document.getElementById('loginPass').value='';
  document.getElementById('loginOverlay').classList.add('show');
}
function closeLogin(){ document.getElementById('loginOverlay').classList.remove('show'); }
async function doLogin(){
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  try{
    const cred = await signInWithEmailAndPassword(auth, adminEmail(u), p);
    const snap = await getDoc(doc(db, 'admins', cred.user.uid));
    if(!snap.exists()){ await signOut(auth); errEl.style.display='block'; return; }
    const found = { uid: cred.user.uid, ...snap.data() };
    currentUser = found; isAdmin = true; isSuperAdmin = found.role==='super';
    closeLogin(); renderAll(); toast('Đăng nhập thành công · ' + roleLabel(found.role), 'ok');
  }catch(e){ console.error('Lỗi đăng nhập cán bộ:', e.code, e.message); errEl.style.display='block'; }
}
function logout(){ signOut(auth); currentUser = null; isAdmin = false; isSuperAdmin = false; renderAll(); }

/* ============ Đăng ký / đăng nhập cho Hộ trồng & Quán ăn-Chợ ============ */
function openPersonAuth(mode){
  document.getElementById('personLoginError').style.display='none';
  document.getElementById('personRegisterError').style.display='none';
  document.getElementById('pu_loginUser').value=''; document.getElementById('pu_loginPass').value='';
  ['pu_displayName','pu_regUser','pu_regPass','pu_phone','pu_ap'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('pu_role').value='grower';
  togglePuApField();
  switchPersonAuth(mode || 'login');
  document.getElementById('personAuthOverlay').classList.add('show');
}
function closePersonAuth(){ document.getElementById('personAuthOverlay').classList.remove('show'); }
function switchPersonAuth(mode){
  const isLogin = mode==='login';
  document.getElementById('personAuthTitle').textContent = isLogin ? 'Đăng nhập' : 'Đăng ký tài khoản';
  document.getElementById('personLoginView').style.display = isLogin ? 'block' : 'none';
  document.getElementById('personRegisterView').style.display = isLogin ? 'none' : 'block';
}
function togglePuApField(){
  document.getElementById('pu_ap_field').style.display = document.getElementById('pu_role').value==='grower' ? 'block' : 'none';
}
async function doPersonLogin(){
  const u = document.getElementById('pu_loginUser').value.trim();
  const p = document.getElementById('pu_loginPass').value;
  const errEl = document.getElementById('personLoginError');
  try{
    const cred = await signInWithEmailAndPassword(auth, personEmail(u), p);
    const snap = await getDoc(doc(db, 'personUsers', cred.user.uid));
    if(!snap.exists()){ await signOut(auth); errEl.style.display='block'; return; }
    currentPersonUser = { uid: cred.user.uid, ...snap.data() };
    closePersonAuth(); renderAll();
    toast('Đăng nhập thành công · ' + personRoleLabel(currentPersonUser.role), 'ok');
  }catch(e){ console.error('Lỗi đăng nhập người dùng:', e.code, e.message); errEl.style.display='block'; }
}
function personLogout(){ signOut(auth); currentPersonUser = null; renderAll(); }
async function doPersonRegister(){
  const role = document.getElementById('pu_role').value;
  const displayName = document.getElementById('pu_displayName').value.trim();
  const username = document.getElementById('pu_regUser').value.trim();
  const password = document.getElementById('pu_regPass').value;
  const phone = document.getElementById('pu_phone').value.trim();
  const ap = role==='grower' ? document.getElementById('pu_ap').value.trim() : '';
  const err = document.getElementById('personRegisterError');
  if(!displayName || !username || !password || !phone || (role==='grower' && !ap) || personUsers.some(x=>x.username===username)){
    err.style.display='block'; return;
  }
  try{
    const cred = await createUserWithEmailAndPassword(auth, personEmail(username), password);
    const record = { username, role, displayName, phone, ap, createdDate: new Date().toISOString().slice(0,10) };
    await setDoc(doc(db, 'personUsers', cred.user.uid), record);
    currentPersonUser = { uid: cred.user.uid, ...record };
    closePersonAuth(); renderAll();
    toast('Đăng ký thành công, đã đăng nhập', 'ok');
  }catch(e){
    err.textContent = e.code==='auth/email-already-in-use' ? 'Tên đăng nhập đã tồn tại.' : ('Lỗi: ' + e.message);
    err.style.display='block';
  }
}

/* ============ Đổi mật khẩu của chính mình ============ */
function openPwForm(){
  document.getElementById('pwError').style.display='none';
  document.getElementById('pw_user').value = currentUser.user;
  document.getElementById('pw_pass').value=''; document.getElementById('pw_pass2').value='';
  document.getElementById('pwOverlay').classList.add('show');
}
function closePwForm(){ document.getElementById('pwOverlay').classList.remove('show'); }
async function savePwForm(){
  const p1 = document.getElementById('pw_pass').value, p2 = document.getElementById('pw_pass2').value;
  const errEl = document.getElementById('pwError');
  if(!p1 || p1!==p2){ errEl.style.display='block'; return; }
  try{
    await updatePassword(auth.currentUser, p1);
    closePwForm(); toast('Đã đổi mật khẩu', 'ok');
  }catch(e){
    errEl.textContent = e.code==='auth/requires-recent-login'
      ? 'Vì lý do bảo mật, hãy đăng xuất rồi đăng nhập lại trước khi đổi mật khẩu.'
      : ('Không thể đổi mật khẩu: ' + e.message);
    errEl.style.display='block';
  }
}

/* ============ Quản lý tài khoản (chỉ Quản trị viên xã) ============ */
function openAccountsModal(){
  if(!isSuperAdmin) return;
  renderAccountsTable();
  document.getElementById('accountsOverlay').classList.add('show');
}
function closeAccountsModal(){ document.getElementById('accountsOverlay').classList.remove('show'); }
function renderAccountsTable(){
  const body = document.getElementById('accountsTableBody');
  if(admins.length===0){ body.innerHTML = emptyRow(4, 'Chưa có tài khoản nào.'); return; }
  body.innerHTML = admins.map(a=>`
    <tr>
      <td>${a.user}${a.uid===currentUser.uid ? ' <span class="chip chip-growing">Bạn</span>' : ''}</td>
      <td>${roleLabel(a.role)}</td>
      <td>${a.ap || '—'}</td>
      <td class="row-actions">
        <button class="btn btn-sm" onclick="openAccountForm('${a.uid}')">Sửa</button>
        ${a.uid!==currentUser.uid ? `<button class="btn btn-sm btn-danger" onclick="deleteAccount('${a.uid}')">Xóa</button>` : ''}
      </td>
    </tr>`).join('');
}
function toggleAccountApField(){
  document.getElementById('acc_ap_field').style.display = document.getElementById('acc_role').value==='ward' ? 'block' : 'none';
}
function openAccountForm(uid){
  if(!isSuperAdmin) return;
  document.getElementById('accountFormError').style.display='none';
  document.getElementById('accountFormOverlay').classList.add('show');
  if(uid){
    const a = admins.find(x=>x.uid===uid);
    document.getElementById('accountFormTitle').textContent = 'Sửa tài khoản';
    document.getElementById('acc_editUser').value = uid;
    document.getElementById('acc_user').value = a.user;
    document.getElementById('acc_user').disabled = true;
    document.getElementById('acc_pass').value = '';
    document.getElementById('acc_pass').placeholder = 'Chưa hỗ trợ đổi mật khẩu hộ — để trống';
    document.getElementById('acc_pass').disabled = true;
    document.getElementById('acc_pass_label').textContent = 'Mật khẩu (người đó tự đổi trong "Đổi mật khẩu")';
    document.getElementById('acc_role').value = a.role;
    document.getElementById('acc_ap').value = a.ap || '';
  }else{
    document.getElementById('accountFormTitle').textContent = 'Thêm tài khoản';
    document.getElementById('acc_editUser').value = '';
    document.getElementById('acc_user').value = ''; document.getElementById('acc_user').disabled = false;
    document.getElementById('acc_pass').value = ''; document.getElementById('acc_pass').placeholder = '••••••';
    document.getElementById('acc_pass').disabled = false;
    document.getElementById('acc_pass_label').textContent = 'Mật khẩu';
    document.getElementById('acc_role').value = 'ward'; document.getElementById('acc_ap').value = '';
  }
  toggleAccountApField();
}
function closeAccountForm(){ document.getElementById('accountFormOverlay').classList.remove('show'); }
async function saveAccountForm(){
  const editUid = document.getElementById('acc_editUser').value;
  const user = document.getElementById('acc_user').value.trim();
  const pass = document.getElementById('acc_pass').value;
  const role = document.getElementById('acc_role').value;
  const ap = role==='ward' ? document.getElementById('acc_ap').value.trim() : null;
  const err = document.getElementById('accountFormError');
  if(!user || (!editUid && !pass) || (role==='ward' && !ap)){ err.style.display='block'; return; }
  try{
    if(editUid){
      await updateDoc(doc(db, 'admins', editUid), { role, ap });
      if(currentUser.uid===editUid) currentUser = { ...currentUser, role, ap };
    }else{
      if(admins.some(a=>a.user===user)){ err.textContent='Tên tài khoản đã tồn tại.'; err.style.display='block'; return; }
      const uid = await createAuthUserWithoutSignIn(adminEmail(user), pass);
      await setDoc(doc(db, 'admins', uid), { user, role, ap });
    }
    await logActivity((editUid ? 'Cập nhật tài khoản: ' : 'Thêm tài khoản mới: ') + user + ' (' + roleLabel(role) + ')');
    closeAccountForm(); renderAccountsTable(); renderAll(); toast('Đã lưu tài khoản', 'ok');
  }catch(e){
    err.textContent = 'Lỗi: ' + e.message; err.style.display='block';
  }
}
async function deleteAccount(uid){
  const target = admins.find(a=>a.uid===uid);
  if(!target) return;
  if(uid===currentUser.uid){ toast('Không thể tự xóa tài khoản đang đăng nhập', 'warn'); return; }
  const remainingSupers = admins.filter(a=>a.role==='super' && a.uid!==uid);
  if(target.role==='super' && remainingSupers.length===0){
    toast('Cần giữ lại ít nhất 1 Quản trị viên xã', 'warn'); return;
  }
  if(!confirm('Xóa tài khoản "' + target.user + '"? (Chỉ xóa hồ sơ trong Firestore; muốn xóa hẳn đăng nhập thì vào Firebase Console → Authentication xóa thêm)')) return;
  await deleteDoc(doc(db, 'admins', uid));
  await logActivity('Xóa tài khoản: ' + target.user);
  renderAccountsTable(); toast('Đã xóa tài khoản', 'warn');
}

/* ============ CRUD mùa vụ ============ */
function openForm(id){
  if(id && !canManage(seasons.find(x=>x.id===id)?.region)){ toast('Bạn không có quyền sửa mùa vụ này', 'warn'); return; }
  document.getElementById('formOverlay').classList.add('show');
  const hhSelect = document.getElementById('f_household');
  hhSelect.innerHTML = '<option value="">— Không xác định —</option>' + households.map(h=>`<option value="${h.id}">${h.name} (${h.ap})</option>`).join('');
  const regionInput = document.getElementById('f_region');
  if(id){
    const s = seasons.find(x=>x.id===id);
    document.getElementById('formTitle').textContent = 'Sửa mùa vụ';
    document.getElementById('editId').value = id;
    document.getElementById('f_name').value = s.name; document.getElementById('f_crop').value = s.crop;
    hhSelect.value = s.householdId || ''; regionInput.value = s.region;
    document.getElementById('f_start').value = s.start; document.getElementById('f_end').value = s.end;
    document.getElementById('f_area').value = s.area; document.getElementById('f_yield').value = s.yieldTon;
    document.getElementById('f_price').value = s.price || ''; document.getElementById('f_specialty').checked = !!s.specialty;
    document.getElementById('f_status').value = s.status;
  }else{
    document.getElementById('formTitle').textContent = 'Thêm mùa vụ';
    document.getElementById('editId').value = ''; hhSelect.value = '';
    ['f_name','f_crop','f_region','f_start','f_end','f_area','f_yield','f_price'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('f_specialty').checked = false; document.getElementById('f_status').value = 'plan';
    if(currentUser && currentUser.role==='ward') regionInput.value = currentUser.ap;
  }
  regionInput.disabled = !!(currentUser && currentUser.role==='ward');
}
function closeForm(){ document.getElementById('formOverlay').classList.remove('show'); document.getElementById('f_region').disabled = false; }
async function saveForm(){
  const id = document.getElementById('editId').value;
  const record = {
    name: document.getElementById('f_name').value.trim(), crop: document.getElementById('f_crop').value.trim(),
    householdId: document.getElementById('f_household').value ? Number(document.getElementById('f_household').value) : null,
    region: document.getElementById('f_region').value.trim(), start: document.getElementById('f_start').value,
    end: document.getElementById('f_end').value, area: Number(document.getElementById('f_area').value||0),
    yieldTon: Number(document.getElementById('f_yield').value||0), price: Number(document.getElementById('f_price').value||0),
    specialty: document.getElementById('f_specialty').checked, status: document.getElementById('f_status').value
  };
  if(currentUser && currentUser.role==='ward') record.region = currentUser.ap; // khoá đúng ấp phụ trách
  if(!record.name){ alert('Vui lòng nhập tên mùa vụ.'); return; }
  if(id){
    if(!canManage(seasons.find(x=>x.id===Number(id))?.region)){ toast('Bạn không có quyền sửa mùa vụ này', 'warn'); return; }
    const idx = seasons.findIndex(x=>x.id===Number(id)); seasons[idx] = { ...seasons[idx], ...record };
  }
  else{ const newId = seasons.length ? Math.max(...seasons.map(s=>s.id))+1 : 1; seasons.push({ id: newId, ...record }); }
  await saveSeasons();
  await logActivity((id ? 'Cập nhật mùa vụ: ' : 'Thêm mùa vụ mới: ') + record.name + ' — bởi ' + currentUser.user);
  closeForm(); renderAll(); toast('Đã lưu mùa vụ', 'ok');
}
async function deleteSeason(id){
  const s = seasons.find(x=>x.id===id);
  if(!canManage(s?.region)){ toast('Bạn không có quyền xóa mùa vụ này', 'warn'); return; }
  if(!confirm('Xóa mùa vụ này?')) return;
  seasons = seasons.filter(x=>x.id!==id);
  await saveSeasons();
  await logActivity('Xóa mùa vụ: ' + (s ? s.name : '') + ' — bởi ' + currentUser.user);
  renderAll(); toast('Đã xóa mùa vụ', 'warn');
}

/* ============ Sắp xếp bảng mùa vụ ============ */
document.addEventListener('click', (e)=>{
  const th = e.target.closest('#subview-ql-muavu th.sortable');
  if(!th) return;
  const key = th.getAttribute('data-sort');
  if(sortKey===key){ sortDir = -sortDir; } else { sortKey = key; sortDir = 1; }
  renderTable();
});

/* ============ Sub-tabs trong section gộp (Hộ trồng & Quy hoạch / Đầu ra & Tin thu mua) ============ */
function initSubtabs(navId, subviewPrefix){
  const nav = document.getElementById(navId);
  if(!nav) return;
  nav.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-subtab]');
    if(!btn) return;
    const key = btn.getAttribute('data-subtab');
    nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active', b===btn));
    nav.parentElement.querySelectorAll('.subview').forEach(sv=>{
      sv.classList.toggle('active-subview', sv.id === 'subview-' + key);
    });
  });
}

/* ============ Trợ lý AI (giao diện chat) ============ */
function renderChat(){
  const log = document.getElementById('chatLog');
  log.innerHTML = chatHistory.map(m=>`<div class="bubble ${m.role==='user'?'bubble-user':'bubble-ai'}${m.loading?' loading':''}">${m.text}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}
function renderAiSuggestions(){
  document.getElementById('aiSuggestions').innerHTML = AI_SUGGESTIONS.map(q=>`<button type="button" class="ai-chip" onclick="askAI('${q.replace(/'/g,"\\'")}')">${q}</button>`).join('');
}
async function askAI(preset){
  const input = document.getElementById('aiQuestion');
  const question = (typeof preset === 'string') ? preset : input.value.trim();
  if(!question){ alert('Nhập câu hỏi trước đã.'); return; }
  input.value = '';
  chatHistory.push({ role: 'user', text: question });
  chatHistory.push({ role: 'ai', text: 'Đang phân tích dữ liệu...', loading: true });
  renderChat();

  const btn = document.getElementById('askAiBtn'); btn.disabled = true;

  const dataSummary = seasons.length ? seasons.map(s =>
    `- ${s.name} | cây/sản phẩm: ${s.crop} | hộ trồng: ${householdName(s.householdId)} | ấp: ${s.region} | diện tích: ${s.area}ha | sản lượng: ${s.yieldTon} tấn | giá TT: ${s.price || '—'} đ/kg | giá trị ước tính: ${money(seasonRevenue(s))}đ | đặc sản: ${s.specialty?'có':'không'} | trạng thái: ${s.status}`
  ).join('\n') : '(chưa có dữ liệu mùa vụ)';
  const householdSummary = households.length ? households.map(h =>
    `- ${h.name} | ấp: ${h.ap} | cây trồng chính: ${h.crop} | diện tích: ${h.area}ha | số năm canh tác: ${h.years||'?'}`
  ).join('\n') : '(chưa có dữ liệu hộ trồng)';
  const qualitySummary = qualityTests.length ? qualityTests.map(q =>
    `- Mùa vụ: ${seasonLabel(q.seasonId)} | chỉ tiêu: ${q.metric} | tiêu chuẩn áp dụng: ${q.standard||'?'} | giá trị đo: ${q.value}${q.unit?' '+q.unit:''} | ngưỡng cho phép: ${q.threshold}${q.unit?' '+q.unit:''} | ngày kiểm: ${q.date||'?'} | đơn vị kiểm định: ${q.lab||'?'} | kết quả: ${q.result==='pass'?'đạt':q.result==='fail'?'không đạt':'chờ kết quả'}${q.note?' | ghi chú: '+q.note:''}`
  ).join('\n') : '(chưa có dữ liệu kiểm định)';
  const certSummary = seasons.length ? seasons.map(s =>
    `- ${s.name}: VietGAP/Nội địa = ${seasonCertStatus(s.id,'VietGAP / Nội địa')}, Siêu thị trong nước = ${seasonCertStatus(s.id,'Siêu thị trong nước')}, Xuất khẩu = ${seasonCertStatus(s.id,'Xuất khẩu (GlobalGAP/MRL quốc tế)')}`
  ).join('\n') : '(chưa có dữ liệu chứng nhận)';
  const outputSummary = outputs.length ? outputs.map(o =>
    `- Mùa vụ: ${seasonLabel(o.seasonId)} | đối tác: ${o.buyer} | kênh: ${o.channel} | khối lượng: ${o.volume} tấn | giá bán: ${o.price||0}đ/kg | thành tiền: ${money(outputRevenue(o))}đ | ngày giao: ${o.date||'?'} | trạng thái: ${o.status==='done'?'đã giao hàng':o.status==='negotiating'?'đang đàm phán':'đã hủy'}`
  ).join('\n') : '(chưa có dữ liệu đầu ra)';
  const procSummary = procurements.length ? procurements.map(p =>
    `- Tin: "${p.title}" | bên mua: ${p.buyer} | cây trồng cần: ${p.crop} | nhu cầu: ${p.quantity} ${p.unitLabel||'tấn'} | giá đề nghị: ${p.priceOffer||0}đ/kg | ưu tiên ấp: ${p.ap} | yêu cầu: ${p.requirement||'không yêu cầu đặc biệt'} | hạn: ${p.deadline||'?'} | trạng thái: ${p.status==='open'?'đang tuyển đầu mối':'đã đủ nguồn hàng'} | số hộ đã gửi chào hàng: ${(p.applicants||[]).length}`
  ).join('\n') : '(chưa có tin thu mua nào)';
  const productSummary = products.length ? products.map(p =>
    `- ${p.name} | người bán: ${p.sellerName||'?'} | ấp: ${p.ap} | còn: ${p.quantity} ${p.unitLabel||'kg'} | giá: ${p.price||0}đ/${p.unitLabel||'kg'} | chứng chỉ: ${p.certification||'Chưa kiểm định'} | trạng thái: ${p.status==='available'?'còn hàng':'hết hàng'} | lượt liên hệ mua: ${(p.buyRequests||[]).length}`
  ).join('\n') : '(chưa có sản phẩm nào đang rao bán)';
  const prompt = `Bạn là trợ lý nông nghiệp cho xã Bình Mỹ, TP.HCM (ven sông Sài Gòn, đang phát triển sản phẩm rau - hoa - quả, đặc biệt là rau móp, gắn với du lịch cộng đồng). Đây là dữ liệu mùa vụ / sản phẩm hiện có của xã:\n${dataSummary}\n\nDanh sách hộ trồng:\n${householdSummary}\n\nDữ liệu kiểm định chất lượng (nồng độ các chất, dư lượng so với ngưỡng cho phép):\n${qualitySummary}\n\nTình trạng chứng nhận theo mùa vụ (đạt/chưa đạt/chưa kiểm định cho từng chuẩn):\n${certSummary}\n\nDữ liệu đầu ra / tiêu thụ sản phẩm đã thực hiện:\n${outputSummary}\n\nCác sản phẩm đang rao bán (hộ trồng đăng, quán ăn/chợ có thể liên hệ mua):\n${productSummary}\n\nCác tin đăng thu mua đang mở (dạng "tin tuyển dụng" cho nông sản, hộ trồng có thể gửi chào hàng/liên hệ):\n${procSummary}\n\nCâu hỏi của người dùng: ${question}\n\nHãy trả lời ngắn gọn, cụ thể, dựa trên dữ liệu trên. Nếu câu hỏi liên quan đến quy hoạch sản xuất, hãy gợi ý dựa trên số hộ, diện tích và cây trồng chủ lực theo từng ấp. Nếu câu hỏi liên quan đến chất lượng, hãy chỉ rõ chỉ tiêu nào vượt ngưỡng và đề xuất hướng khắc phục (VD: giảm bón đạm nếu nitrat cao, giãn cách thời gian cách ly thuốc BVTV...). Nếu câu hỏi liên quan đến bán hàng cho quán ăn/chợ, hãy gợi ý sản phẩm nào đang có sẵn, giá và chứng chỉ ra sao. Nếu câu hỏi liên quan đến tin thu mua, hãy phân tích tin nào phù hợp với hộ trồng nào (theo cây trồng, ấp, yêu cầu chất lượng) và gợi ý hộ trồng nên gửi chào hàng cho tin nào trước. Nếu thiếu dữ liệu để trả lời chính xác, hãy nói rõ, và luôn nhắc rằng các ngưỡng an toàn thực phẩm cần đối chiếu với quy chuẩn QCVN hiện hành.`;
try{
    const text = await apiAskAI(prompt);
    chatHistory[chatHistory.length-1] = { role: 'ai', text };
  }catch(e){
    // ĐÃ SỬA: trước đây hiện thông báo chung chung...
    console.error('Lỗi gọi Gemini API:', e);
    chatHistory[chatHistory.length-1] = { role: 'ai', text: 'Lỗi khi gọi AI: ' + e.message };
  }finally{
    btn.disabled = false; renderChat();
  }
}

/* ============ Điều hướng dạng "trang riêng" (chỉ hiện 1 section tại 1 thời điểm) ============ */
const VIEW_IDS = ['tin-thu-mua','kiem-dinh','tro-ly-ai','quan-ly'];
function showView(id){
  if(!VIEW_IDS.includes(id)) id = 'tin-thu-mua';
  VIEW_IDS.forEach(vid=>{
    const el = document.getElementById(vid);
    if(el) el.classList.toggle('active-view', vid===id);
  });
  document.querySelectorAll('.pillnav a').forEach(a=>a.classList.toggle('active', a.getAttribute('data-nav')===id));
  window.scrollTo(0, 0);
}
function initRouter(){
  const applyFromHash = ()=>{ showView((location.hash || '#tin-thu-mua').slice(1)); };
  window.addEventListener('hashchange', applyFromHash);
  applyFromHash();
}

/* ============ Khởi động ============ */
(async function init(){
  initRouter(); // luôn bật điều hướng trước — nếu bước tải dữ liệu bên dưới lỗi, trang vẫn không bị trắng
  initSubtabs('quanLyTabs', 'subview-');
  initSubtabs('dauRaTabs2', 'subview-');
  try{
    await loadData();
    renderAll();
    renderAiSuggestions();
    renderChat();
  }catch(e){
    console.error('Lỗi khởi tạo dữ liệu:', e);
    toast('Có lỗi khi tải dữ liệu, đang dùng dữ liệu mẫu', 'warn');
  }
  tickClock(); setInterval(tickClock, 1000);
  document.getElementById('searchSeason').addEventListener('input', debounce(renderTable, 250));
  document.getElementById('filterStatus').addEventListener('change', renderTable);
  document.getElementById('searchHh').addEventListener('input', debounce(renderHouseholds, 250));
  document.getElementById('filterAp').addEventListener('change', renderHouseholds);
  document.getElementById('searchQuality').addEventListener('input', debounce(renderQuality, 250));
  document.getElementById('filterQualityResult').addEventListener('change', renderQuality);
  document.getElementById('filterQualityStandard').addEventListener('change', renderQuality);
  document.getElementById('searchOutput').addEventListener('input', debounce(renderOutputs, 250));
  document.getElementById('filterOutputStatus').addEventListener('change', renderOutputs);
  document.getElementById('searchProc').addEventListener('input', debounce(renderProcurements, 250));
  document.getElementById('filterProcStatus').addEventListener('change', renderProcurements);
  document.getElementById('filterProcCrop').addEventListener('change', renderProcurements);
  document.getElementById('searchProduct').addEventListener('input', debounce(renderProducts, 250));
  document.getElementById('filterProductName').addEventListener('change', renderProducts);
  document.getElementById('filterProductCert').addEventListener('change', renderProducts);
  setupRealtime(); // Firestore tự đẩy cập nhật theo thời gian thực, không cần poll định kỳ nữa
})();

/* ============ Đưa các hàm ra phạm vi toàn cục (window) ============ */
/* Bắt buộc vì app.js giờ là ES module (dùng "import" của Firebase) — các thuộc tính
   onclick="..." viết thẳng trong index.html chỉ gọi được hàm nằm trên window. */
Object.assign(window, {
  askAI, closeAccountForm, closeAccountsModal, closeApplyForm, closeBuyForm, closeForm, closeHhForm,
  closeLogin, closeOutputForm, closePersonAuth, closeProcForm, closeProductForm, closePwForm, closeQualityForm,
  deleteAccount, deleteHousehold, deleteOutput, deleteProcurement, deleteProduct, deleteQualityTest, deleteSeason,
  doLogin, doPersonLogin, doPersonRegister, exportCsv, logout,
  openAccountForm, openAccountsModal, openApplyForm, openBuyForm, openForm, openHhForm, openLogin,
  openOutputForm, openPersonAuth, openProcForm, openProductForm, openPwForm, openQualityForm, personLogout,
  saveAccountForm, saveForm, saveHhForm, saveOutputForm, saveProcForm, saveProductForm, savePwForm, saveQualityForm,
  submitApplication, submitBuyRequest, switchPersonAuth, toggleAccountApField, toggleApplicants, toggleBuyers,
  toggleProcStatus, toggleProductStatus, togglePuApField
});
