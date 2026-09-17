// ============================================================================
// HỆ THỐNG QUẢN LÝ NÔNG NGHIỆP & ĐẦU RA NÔNG SẢN XÃ BÌNH MỸ, TP. HỒ CHÍ MINH
// Bản nâng cấp toàn diện: Logic nghiệp vụ, Xác thực phân quyền, Kiểm định chất lượng,
// Khả năng chịu lỗi ngoại tuyến, Trợ lý AI phân tích dữ liệu cục bộ & giao diện đáp ứng.
// ============================================================================

import { initializeApp, deleteApp }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updatePassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
import { IMPORTABLE_KEYS, buildTestDataImportValue, prepareTestDataImport } from './import-data.js';

/* ============ Cấu hình Firebase ============ */
const firebaseConfig = {
  apiKey: "AIzaSyDuqly5ejTvMgr3a6OKNvcwGPd3jk7nlZk",
  authDomain: "binhmy-nongnghiep.firebaseapp.com",
  projectId: "binhmy-nongnghiep",
  storageBucket: "binhmy-nongnghiep.firebasestorage.app",
  messagingSenderId: "356707994338",
  appId: "1:356707994338:web:df236f5580c0ea2731ecbb"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const functions = getFunctions(firebaseApp, 'asia-southeast1');

/* ============ Trạng thái ứng dụng ============ */
const SAMPLE_SEASONS = [];
const SAMPLE_HOUSEHOLDS = [];
const SAMPLE_QUALITY = [];
const SAMPLE_OUTPUTS = [];
const SAMPLE_PROCUREMENTS = [];

const AI_SUGGESTIONS = [
  'Sản phẩm nào đã kiểm định đạt chuẩn an toàn & VietGAP?',
  'Cách quét mã QR để kiểm tra nguồn gốc rau củ Bình Mỹ?',
  'Mặt hàng nào đang bán nhiều nhất tại xã Bình Mỹ?',
  'Chỉ tiêu kiểm định nào đang cần lưu ý trước khi xuất hàng?',
  'Đầu ra nào đang cần thu mua chôm chôm & rau an toàn?'
];

let seasons = [];
let households = [];
let qualityTests = [];
let outputs = [];
let procurements = [];
let products = [];
let currentPersonUser = null; // { username, role: 'grower'|'buyer', displayName, phone, ap }
let admins = [];
let currentUser = null; // { user, role: 'super'|'ward', ap }
let activity = [];
let isAdmin = false;
let isSuperAdmin = false;
let chart = null;
let wardChart = null;

// Sắp xếp bảng mùa vụ
let sortKey = null;
let sortDir = 1;

// Sắp xếp bảng hộ trồng
let hhSortKey = null;
let hhSortDir = 1;

let chatHistory = [];
let firstLoadDone = false;
let authReady = false;
const initialHash = (location.hash || '').slice(1);

const EXTERNAL_SCRIPTS = {
  chart: { src: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js', global: 'Chart' },
  scanner: { src: 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js', global: 'Html5Qrcode' },
  qrcode: { src: 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', global: 'QRCode' }
};
const externalScriptLoads = new Map();
function loadExternalScript(name){
  const config = EXTERNAL_SCRIPTS[name];
  if(!config) return Promise.reject(new Error('Thư viện không hợp lệ: ' + name));
  if(window[config.global]) return Promise.resolve();
  if(externalScriptLoads.has(name)) return externalScriptLoads.get(name);
  const load = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = config.src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Không tải được ' + name));
    document.head.append(script);
  });
  externalScriptLoads.set(name, load);
  return load;
}

/* ============ Tiện ích hiển thị & tính toán ============ */
function seasonRevenue(s){
  return Number(s.yieldTon || 0) * 1000 * Number(s.price || 0);
}

function seasonYieldPerHa(s){
  const area = Number(s.area || 0);
  const yieldTon = Number(s.yieldTon || 0);
  return area > 0 ? (yieldTon / area) : 0;
}

function csvEscape(v){
  const str = String(v == null ? '' : v);
  if(/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function esc(v){
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function emptyRow(colspan, text){
  return `<tr><td colspan="${colspan}" class="empty"><svg class="icon"><use href="#icon-sprout"/></svg>${text}</td></tr>`;
}

function money(n){
  return Number(n || 0).toLocaleString('vi-VN');
}

function debounce(fn, wait){
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
}

function relTime(ts){
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if(m < 1) return 'vừa xong';
  if(m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if(h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

let toastTimer;
function toast(msg, type = 'ok'){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.className = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 3200);
}

function animateCount(el, to, isMoney){
  if(!el) return;
  const from = Number(el.dataset.val || 0);
  el.dataset.val = to;
  if(from === to){
    el.textContent = isMoney ? (to / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'tr' : Math.round(to).toLocaleString('vi-VN');
    return;
  }
  const dur = 400;
  const start = performance.now();
  function step(now){
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = from + (to - from) * eased;
    el.textContent = isMoney ? (val / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'tr' : Math.round(val).toLocaleString('vi-VN');
    if(p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ============ Hỗ trợ xác thực biểu mẫu & trạng thái nút ============ */
function setFieldError(fieldId, errorId, message){
  const field = document.getElementById(fieldId);
  const err = document.getElementById(errorId);
  if(field) field.classList.add('has-error');
  if(err){
    err.textContent = message;
    err.style.display = 'block';
  }
}

function clearFieldErrors(containerId){
  const container = document.getElementById(containerId);
  if(!container) return;
  container.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
  container.querySelectorAll('.field-error-msg').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

function setBtnLoading(btnId, isLoading, defaultText = 'Lưu'){
  const btn = document.getElementById(btnId);
  if(!btn) return;
  if(isLoading){
    btn.disabled = true;
    btn.dataset.prevHtml = btn.innerHTML;
    btn.innerHTML = `<span class="typing-dots" style="vertical-align:middle;margin-right:6px;"><span></span><span></span><span></span></span>Đang lưu...`;
    btn.classList.add('is-loading');
  }else{
    btn.disabled = false;
    btn.innerHTML = btn.dataset.prevHtml || defaultText;
    btn.classList.remove('is-loading');
  }
}

/* ============ Hộp thoại xác nhận tùy chỉnh (thay thế window.confirm) ============ */
function showConfirmDialog(title, message, confirmText = 'Xác nhận xóa', isDanger = true){
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirmOverlay');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMsg');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    if(!overlay || !titleEl || !msgEl || !okBtn || !cancelBtn){
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent = title;
    msgEl.innerHTML = esc(message).replace(/\n/g, '<br>');
    okBtn.textContent = confirmText;
    okBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';

    const cleanup = () => {
      overlay.classList.remove('show');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onEsc);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOverlay = (e) => { if(e.target === overlay){ cleanup(); resolve(false); } };
    const onEsc = (e) => { if(e.key === 'Escape'){ cleanup(); resolve(false); } };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onEsc);

    overlay.classList.add('show');
    cancelBtn.focus();
  });
}

function closeConfirmModal(){
  const overlay = document.getElementById('confirmOverlay');
  if(overlay) overlay.classList.remove('show');
}

/* ============ Quản lý trạng thái đồng bộ mạng ============ */
let syncHideTimer = null;
function setSyncStatus(state){
  const pill = document.getElementById('syncPill');
  const text = document.getElementById('syncText');
  if(!pill || !text) return;
  clearTimeout(syncHideTimer);

  pill.classList.remove('syncing', 'sync-offline', 'sync-error');
  if(state === 'syncing'){
    pill.classList.add('syncing');
    text.textContent = 'Đang đồng bộ...';
  }else if(state === 'offline'){
    pill.classList.add('sync-offline');
    text.textContent = 'Ngoại tuyến (Bộ nhớ tạm)';
  }else if(state === 'error'){
    pill.classList.add('sync-error');
    text.textContent = 'Lỗi kết nối máy chủ';
  }else{
    syncHideTimer = setTimeout(() => {
      text.textContent = 'Đã đồng bộ';
    }, 400);
  }
}

window.addEventListener('online', () => {
  setSyncStatus('synced');
  toast('Đã khôi phục kết nối mạng', 'ok');
});

window.addEventListener('offline', () => {
  setSyncStatus('offline');
  toast('Mất kết nối mạng - Đang hoạt động ở chế độ ngoại tuyến', 'warn');
});

/* ============ Email & Auth Helper ============ */
function adminEmail(username){ return String(username || '').trim().toLowerCase(); }
function personEmail(username){ return String(username || '').trim().toLowerCase(); }
function isEmail(v){ return typeof v === 'string' && /\S+@\S+\.\S+/.test(v); }

async function createAuthUserWithoutSignIn(email, password){
  const secondaryApp = initializeApp(firebaseConfig, 'secondary-' + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try{
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    return uid;
  }finally{
    await deleteApp(secondaryApp);
  }
}

/* ============ Lưu trữ dùng chung — Firestore, có đồng bộ thời gian thực ============ */
const PUBLIC_APPDATA_KEYS = ['seasons','households','qualityTests','outputs','procurements','products'];
const ADMIN_APPDATA_KEYS = ['activity'];
let stopAdminRealtime = [];
const DEFAULT_APPDATA = {
  seasons: SAMPLE_SEASONS,
  households: SAMPLE_HOUSEHOLDS,
  qualityTests: SAMPLE_QUALITY,
  outputs: SAMPLE_OUTPUTS,
  procurements: SAMPLE_PROCUREMENTS,
  products: [],
  activity: []
};

function removeVietnameseTones(str){
  str = String(str || '').toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
  str = str.replace(/\u02C6|\u0306|\u031B/g, "");
  return str.trim();
}

function normalizeProduct(p, idx){
  if(!p || typeof p !== 'object') return p;
  const id = Number(p.id || (idx + 1));
  const productCode = p.productCode || ('BM-2026-' + String(id).padStart(3, '0'));
  const batchCode = p.batchCode || ('LÔ-' + String(id).padStart(2, '0'));
  const harvestDate = p.harvestDate || p.postedDate || new Date().toISOString().slice(0, 10);
  const qrCode = p.qrCode || `${window.location.origin}${window.location.pathname}#san-pham=${encodeURIComponent(productCode)}`;
  return {
    ...p,
    id,
    productCode,
    batchCode,
    harvestDate,
    qrCode,
    name: p.name || 'Nông sản Bình Mỹ',
    sellerName: p.sellerName || p.ownerName || 'Hộ trồng Bình Mỹ',
    ap: p.ap || p.area || 'Xã Bình Mỹ',
    status: p.status || 'available',
    certification: p.certification || 'Chưa kiểm định',
    unitLabel: p.unitLabel || 'kg',
    quantity: Number(p.quantity || 0),
    price: Number(p.price || 0),
    buyRequests: Array.isArray(p.buyRequests) ? p.buyRequests : []
  };
}

function applyAppDataValue(key, value){
  switch(key){
    case 'seasons': seasons = value || []; break;
    case 'households': households = value || []; break;
    case 'qualityTests': qualityTests = value || []; break;
    case 'outputs': outputs = value || []; break;
    case 'procurements': procurements = value || []; break;
    case 'products':
      products = (value || []).map((p, idx) => normalizeProduct(p, idx));
      break;
    case 'activity': activity = value || []; break;
  }
}

async function loadData(){
  for(const key of PUBLIC_APPDATA_KEYS){
    try{
      const snap = await getDoc(doc(db, 'appData', key));
      const value = snap.exists() ? snap.data().value : (DEFAULT_APPDATA[key] || []);
      applyAppDataValue(key, value);
    }catch(e){
      applyAppDataValue(key, []);
    }
  }
}

function setupRealtime(){
  PUBLIC_APPDATA_KEYS.forEach(key => {
    onSnapshot(doc(db, 'appData', key), (snap) => {
      applyAppDataValue(key, snap.exists() ? snap.data().value : []);
      renderAll();
      if(firstLoadDone && key !== 'activity') toast('Dữ liệu vừa được cập nhật', 'ok');
      firstLoadDone = true;
    }, (err) => {
      console.error('Lỗi đồng bộ ' + key, err);
      setSyncStatus('error');
    });
  });

}

function setupAdminRealtime(){
  if(!isAdmin || stopAdminRealtime.length) return;
  ADMIN_APPDATA_KEYS.forEach(key => stopAdminRealtime.push(onSnapshot(doc(db, 'appData', key), snap => {
    applyAppDataValue(key, snap.exists() ? snap.data().value : []);
    renderAll();
  }, err => console.error('Lỗi đồng bộ ' + key, err))));
  if(!isSuperAdmin) return;
  stopAdminRealtime.push(onSnapshot(collection(db, 'admins'), snap => {
    admins = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    if(currentUser){ const me = admins.find(a => a.uid === currentUser.uid); if(me) currentUser = me; }
    renderAll();
    if(document.getElementById('accountsOverlay')?.classList.contains('show')) renderAccountsTable();
  }, err => console.error('Lỗi đồng bộ admins', err)));
}

async function saveAppData(key, value){
  if(!navigator.onLine){
    setSyncStatus('offline');
    toast('Đang ngoại tuyến, dữ liệu tạm thời chưa đẩy lên đám mây', 'warn');
  }else{
    setSyncStatus('syncing');
  }
  try{
    await setDoc(doc(db, 'appData', key), { value });
    setSyncStatus('synced');
    return { ok: true };
  }catch(e){
    console.error('Lỗi lưu ' + key, e);
    setSyncStatus('error');
    toast('Lỗi đồng bộ dữ liệu, vui lòng kiểm tra kết nối mạng', 'warn');
    return { ok: false, error: e.message || 'Không thể ghi dữ liệu lên Firestore.' };
  }
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
  activity = activity.slice(0, 30);
  renderActivity();
  return await saveActivity();
}

/* ============ Phục hồi phiên làm việc ============ */
onAuthStateChanged(auth, async (user) => {
  if(!user){
    stopAdminRealtime.forEach(stop => stop());
    stopAdminRealtime = [];
    currentUser = null;
    isAdmin = false;
    isSuperAdmin = false;
    currentPersonUser = null;
    admins = [];
    activity = [];
    authReady = true;
    renderAll();
    return;
  }
  try{
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    if(adminSnap.exists()){
      currentUser = { uid: user.uid, ...adminSnap.data() };
      isAdmin = true;
      isSuperAdmin = currentUser.role === 'super';
    }else{
      const personSnap = await getDoc(doc(db, 'personUsers', user.uid));
      if(personSnap.exists()){
        currentPersonUser = { uid: user.uid, ...personSnap.data() };
      }
    }
  }catch(e){
    console.error('Lỗi khôi phục phiên đăng nhập', e);
  }
  if(!authReady){
    authReady = true;
    restoreAdminDeepLinkIfNeeded();
  }
  setupAdminRealtime();
  renderAll();
});

/* ============ Đồng hồ trực tiếp ============ */
function tickClock(){
  const now = new Date();
  const el = document.getElementById('clock');
  if(el){
    el.textContent = now.toLocaleTimeString('vi-VN') + ' · ' + now.toLocaleDateString('vi-VN');
  }
}

/* ============ Phân quyền người dùng ============ */
function canManage(ap){
  if(!currentUser) return false;
  if(currentUser.role === 'super') return true;
  return currentUser.role === 'ward' && currentUser.ap === ap;
}

function canManageProc(p){
  if(!p) return false;
  if(canManage(p.ap)) return true;
  return !!(currentPersonUser && currentPersonUser.role === 'buyer' && p.ownerUsername === currentPersonUser.username);
}

function canManageProduct(p){
  if(!p) return false;
  if(canManage(p.ap)) return true;
  return !!(currentPersonUser && currentPersonUser.role === 'grower' && p.ownerUsername === currentPersonUser.username);
}

function actorLabel(){
  if(currentUser) return currentUser.user;
  if(currentPersonUser) return currentPersonUser.displayName + ' (' + personRoleLabel(currentPersonUser.role) + ')';
  return 'Ẩn danh';
}

function seasonRegion(id){
  const s = seasons.find(x => x.id === Number(id));
  return s ? s.region : null;
}

function roleLabel(role){
  return role === 'super' ? 'Quản trị viên xã' : 'Cán bộ ấp';
}

function personRoleLabel(role){
  return role === 'grower' ? 'Hộ trồng' : 'Quán ăn / Chợ';
}

function initials(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if(parts.length === 0) return '?';
  if(parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toggleAuthMenu(e){
  e && e.stopPropagation();
  const wrap = document.getElementById('authMenuWrap');
  if(!wrap) return;
  const isOpen = wrap.classList.toggle('open');
  wrap.querySelector('.auth-avatar-btn')?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeAuthMenu(){
  const wrap = document.getElementById('authMenuWrap');
  if(!wrap) return;
  wrap.classList.remove('open');
  wrap.querySelector('.auth-avatar-btn')?.setAttribute('aria-expanded', 'false');
}

function closeAuthMenuThen(fn){
  closeAuthMenu();
  if(typeof fn === 'function') fn();
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('authMenuWrap');
  if(wrap && wrap.classList.contains('open') && !wrap.contains(e.target)) closeAuthMenu();
});

document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape'){
    closeAuthMenu();
    closeImageLightbox();
    closeProductDetail();
    closeProductQrModal();
    // Đóng bất kỳ modal đang mở
    document.querySelectorAll('.modal-overlay.show, .overlay.show').forEach(m => m.classList.remove('show'));
  }
});

function renderAuthArea(){
  const el = document.getElementById('authArea');
  if(!el) return;
  if(currentUser){
    const label = currentUser.user;
    const accent = isSuperAdmin ? 'var(--bloom)' : 'var(--river)';
    const roleTxt = roleLabel(currentUser.role) + (currentUser.ap ? ' · ' + currentUser.ap : '');
    el.innerHTML = `
      <div class="auth-menu-wrap" id="authMenuWrap">
        <button type="button" class="auth-avatar-btn" onclick="toggleAuthMenu(event)" title="Hồ sơ cán bộ (${esc(label)})" aria-expanded="false">
          <span class="auth-avatar" style="background:${accent}">${esc(initials(label))}</span>
        </button>
        <div class="auth-dropdown" role="menu">
          <div class="auth-user-info">
            <div class="auth-user-name">${esc(label)}</div>
            <div class="auth-user-role">${esc(roleTxt)}</div>
          </div>
          <button type="button" class="auth-dropdown-item" onclick="closeAuthMenuThen(switchToAdmin)">
            <svg class="icon"><use href="#icon-admin"/></svg>Trang quản lý cán bộ
          </button>
          ${isSuperAdmin ? `<button type="button" class="auth-dropdown-item" onclick="closeAuthMenuThen(openAccountsModal)">
            <svg class="icon"><use href="#icon-settings"/></svg>Quản lý tài khoản cán bộ
          </button>
          <button type="button" class="auth-dropdown-item" onclick="closeAuthMenuThen(openTestDataImportModal)">
            <span style="font-size:14px;margin-right:2px;">🧪</span>Nhập dữ liệu test
          </button>` : ''}
          <button type="button" class="auth-dropdown-item" onclick="closeAuthMenuThen(openPwForm)">
            <svg class="icon"><use href="#icon-edit"/></svg>Đổi mật khẩu
          </button>
          <button type="button" class="auth-dropdown-item text-danger" onclick="closeAuthMenuThen(logout)">
            <svg class="icon"><use href="#icon-logout"/></svg>Đăng xuất
          </button>
        </div>
      </div>`;
  }else if(currentPersonUser){
    const name = currentPersonUser.displayName || currentPersonUser.username;
    const roleTxt = personRoleLabel(currentPersonUser.role) + (currentPersonUser.ap ? ' · ' + currentPersonUser.ap : '');
    el.innerHTML = `
      <div class="auth-menu-wrap" id="authMenuWrap">
        <button type="button" class="auth-avatar-btn" onclick="toggleAuthMenu(event)" title="Hồ sơ ${personRoleLabel(currentPersonUser.role)} (${esc(name)})" aria-expanded="false">
          <span class="auth-avatar" style="background:var(--papaya)">${esc(initials(name))}</span>
        </button>
        <div class="auth-dropdown" role="menu">
          <div class="auth-user-info">
            <div class="auth-user-name">${esc(name)}</div>
            <div class="auth-user-role">${esc(roleTxt)}</div>
          </div>
          <button type="button" class="auth-dropdown-item" onclick="closeAuthMenuThen(openPwForm)">
            <svg class="icon"><use href="#icon-edit"/></svg>Đổi mật khẩu
          </button>
          <button type="button" class="auth-dropdown-item text-danger" onclick="closeAuthMenuThen(personLogout)">
            <svg class="icon"><use href="#icon-logout"/></svg>Đăng xuất
          </button>
        </div>
      </div>`;
  }else{
    el.innerHTML = `
      <div class="auth-anon-actions">
        <button type="button" class="btn btn-sm btn-ghost" onclick="openPersonAuth('login')">Đăng nhập</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="openPersonAuth('register')">Đăng ký tài khoản</button>
      </div>`;
  }
  updateNavAdminVisibility();
}

/* ============ Thẻ thống kê & Tổng quan ============ */
function statCard(id, value, label, accent, isMoney, icon){
  return `
  <div class="stat-card" style="--accent:${accent}">
    <svg class="icon stat-icon"><use href="#${icon}"/></svg>
    <div class="num-face" id="${id}" data-val="0">0</div>
    <div class="lbl">${label}</div>
  </div>`;
}

function renderStatsGrid(){
  const totalArea = seasons.reduce((a, s) => a + Number(s.area || 0), 0);
  const totalYield = seasons.reduce((a, s) => a + Number(s.yieldTon || 0), 0);
  const totalRevenue = seasons.reduce((a, s) => a + seasonRevenue(s), 0);
  const avgYield = totalArea > 0 ? (totalYield / totalArea) : 0;
  const grid = document.getElementById('statsGrid');
  if(!grid) return;

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
  const avgEl = document.getElementById('statAvg');
  if(avgEl) avgEl.textContent = avgYield.toFixed(2);
  animateCount(document.getElementById('statRevenue'), totalRevenue, true);
}

/* ============ Cảnh báo thông minh & Phím tắt hành động nhanh ============ */
function renderSmartAlerts(){
  const panel = document.getElementById('smartAlertPanel');
  if(!panel) return;

  const alerts = [];

  // 1. Kiểm tra các mẫu kiểm định không đạt
  const failingTests = qualityTests.filter(q => q.result === 'fail');
  if(failingTests.length > 0){
    const names = Array.from(new Set(failingTests.map(q => q.metric))).join(', ');
    alerts.push({
      type: 'danger',
      title: `${failingTests.length} chỉ tiêu kiểm định chưa đạt chuẩn an toàn`,
      desc: `Chỉ tiêu cần xử lý: <strong>${esc(names)}</strong>. Đề xuất kiểm tra nguồn nước tưới và tạm dừng thu hoạch các lô liên quan.`,
      actionText: 'Xem bảng kiểm định',
      actionFn: "location.hash = 'kiem-dinh'"
    });
  }

  // 2. Kiểm tra các mùa vụ năng suất thấp bất thường
  const lowYieldSeasons = seasons.filter(s => {
    const y = seasonYieldPerHa(s);
    return Number(s.area || 0) > 0 && y > 0 && y < 2.5;
  });
  if(lowYieldSeasons.length > 0){
    alerts.push({
      type: 'warning',
      title: `${lowYieldSeasons.length} mùa vụ ghi nhận năng suất thấp (< 2.5 tấn/ha)`,
      desc: `Bao gồm: ${lowYieldSeasons.slice(0, 2).map(s => esc(s.name)).join(', ')}. Cần cán bộ phụ trách ấp đến khảo sát thực tế và tư vấn kỹ thuật.`,
      actionText: 'Lọc mùa vụ',
      actionFn: "quickFilterLowYield()"
    });
  }

  // 3. Tin thu mua sắp hết hạn
  const expiringProc = procurements.filter(p => {
    if(p.status !== 'open' || !p.deadline) return false;
    const d = new Date(p.deadline + 'T00:00:00');
    const now = new Date();
    now.setHours(0,0,0,0);
    const diff = Math.round((d - now) / 86400000);
    return diff >= 0 && diff <= 3;
  });
  if(expiringProc.length > 0){
    alerts.push({
      type: 'info',
      title: `${expiringProc.length} tin thu mua sắp đóng trong 3 ngày tới`,
      desc: `Tin: "${esc(expiringProc[0].title)}" của ${esc(expiringProc[0].buyer)}. Hộ trồng cần gửi chào hàng gấp.`,
      actionText: 'Xem tin thu mua',
      actionFn: "location.hash = 'tin-thu-mua'"
    });
  }

  if(alerts.length === 0){
    panel.innerHTML = `
      <div class="smart-alert-item info">
        <svg class="smart-alert-icon"><use href="#icon-check"/></svg>
        <div class="smart-alert-content">
          <div class="smart-alert-title">Tình hình canh tác & tiêu thụ ổn định</div>
          <div class="smart-alert-desc">Không có chỉ tiêu kiểm định vượt ngưỡng cảnh báo. Tất cả các mùa vụ đang tiến triển theo kế hoạch.</div>
        </div>
      </div>`;
    return;
  }

  panel.innerHTML = alerts.map(a => `
    <div class="smart-alert-item ${a.type}">
      <svg class="smart-alert-icon"><use href="#icon-alert"/></svg>
      <div class="smart-alert-content">
        <div class="smart-alert-title">${a.title}</div>
        <div class="smart-alert-desc">${a.desc}</div>
      </div>
      <div class="smart-alert-action">
        <button type="button" class="btn btn-sm btn-ghost" onclick="${a.actionFn}">${a.actionText}</button>
      </div>
    </div>`).join('');
}

function quickFilterLowYield(){
  const input = document.getElementById('searchSeason');
  if(input){
    input.value = '';
    renderTable();
    // Chuyển sang subtab mùa vụ nếu đang ở tab quản lý
    const subtab = document.querySelector('button[data-subtab="ql-muavu"]');
    if(subtab) subtab.click();
    toast('Đang hiển thị danh sách mùa vụ', 'ok');
  }
}

function quickAddSeason(){
  if(!isAdmin){
    toast('Chức năng thêm mùa vụ chỉ dành cho Cán bộ nông nghiệp', 'warn');
    return;
  }
  openForm();
}

function quickAddQuality(){
  if(!isAdmin){
    toast('Chức năng ghi nhận kiểm định chỉ dành cho Cán bộ nông nghiệp', 'warn');
    return;
  }
  openQualityForm();
}

function quickAddProc(){
  if(!isAdmin && (!currentPersonUser || currentPersonUser.role !== 'buyer')){
    toast('Vui lòng đăng nhập tài khoản Cán bộ hoặc Đối tác thu mua để đăng tin', 'warn');
    openPersonAuth('login');
    return;
  }
  openProcForm();
}

function quickOpenAI(){
  location.hash = 'tro-ly-ai';
}

/* ============ Bảng quản lý mùa vụ ============ */
function statusChip(s){
  return s === 'plan' ? '<span class="chip chip-plan">Lên kế hoạch</span>'
    : s === 'growing' ? '<span class="chip chip-growing">Đang canh tác</span>'
    : '<span class="chip chip-done">Đã thu hoạch</span>';
}

function householdName(id){
  if(!id) return '—';
  const h = households.find(x => x.id === Number(id));
  return h ? h.name : '—';
}

function sortedSeasons(list){
  if(!sortKey) return list;
  const arr = [...list];
  arr.sort((a, b) => {
    let av, bv;
    if(sortKey === 'household'){
      av = householdName(a.householdId);
      bv = householdName(b.householdId);
    }else if(sortKey === 'revenue'){
      av = seasonRevenue(a);
      bv = seasonRevenue(b);
    }else if(sortKey === 'yieldPerHa'){
      av = seasonYieldPerHa(a);
      bv = seasonYieldPerHa(b);
    }else{
      av = a[sortKey];
      bv = b[sortKey];
    }
    if(typeof av === 'string' || typeof bv === 'string'){
      av = (av == null ? '' : String(av)).toLowerCase();
      bv = (bv == null ? '' : String(bv)).toLowerCase();
      return av.localeCompare(bv) * sortDir;
    }
    return ((av || 0) - (bv || 0)) * sortDir;
  });
  return arr;
}

function currentFilteredSeasons(){
  const filterStatus = document.getElementById('filterStatus')?.value || 'all';
  const filterCrop = document.getElementById('filterSeasonCrop')?.value || 'all';
  const filterAp = document.getElementById('filterSeasonAp')?.value || 'all';
  const q = (document.getElementById('searchSeason')?.value || '').trim().toLowerCase();

  // Cập nhật bộ lọc động cho cây trồng
  const cropSelect = document.getElementById('filterSeasonCrop');
  if(cropSelect && cropSelect.options.length <= 1){
    const uniqueCrops = Array.from(new Set(seasons.map(s => s.crop).filter(Boolean))).sort();
    uniqueCrops.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      cropSelect.appendChild(opt);
    });
  }

  // Cập nhật bộ lọc động cho ấp
  const apSelect = document.getElementById('filterSeasonAp');
  if(apSelect && apSelect.options.length <= 1){
    const uniqueAps = Array.from(new Set(seasons.map(s => s.region).filter(Boolean))).sort();
    uniqueAps.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      apSelect.appendChild(opt);
    });
  }

  let list = seasons;
  if(filterStatus !== 'all') list = list.filter(s => s.status === filterStatus);
  if(filterCrop !== 'all') list = list.filter(s => s.crop === filterCrop);
  if(filterAp !== 'all') list = list.filter(s => s.region === filterAp);

  if(q){
    list = list.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.crop || '').toLowerCase().includes(q) ||
      (s.region || '').toLowerCase().includes(q) ||
      householdName(s.householdId).toLowerCase().includes(q)
    );
  }
  return sortedSeasons(list);
}

function renderTable(){
  const list = currentFilteredSeasons();
  const body = document.getElementById('tableBody');
  if(!body) return;

  if(list.length === 0){
    body.innerHTML = emptyRow(14, 'Không tìm thấy mùa vụ phù hợp.');
  }else{
    body.innerHTML = list.map(s => {
      const yieldHa = seasonYieldPerHa(s);
      const yieldBadge = yieldHa > 0
        ? (yieldHa >= 6.0
            ? `<span class="badge-yield high" title="Năng suất cao">${yieldHa.toFixed(2)} t/ha</span>`
            : yieldHa < 2.5
            ? `<span class="badge-yield low" title="Năng suất thấp">${yieldHa.toFixed(2)} t/ha</span>`
            : `<span class="badge-yield mid">${yieldHa.toFixed(2)} t/ha</span>`)
        : '—';

      return `
      <tr>
        <td><strong>${esc(s.name)}</strong></td>
        <td>${esc(s.crop)}</td>
        <td>${esc(householdName(s.householdId))}</td>
        <td>${esc(s.region)}</td>
        <td>${esc(s.start)}</td>
        <td>${esc(s.end)}</td>
        <td>${esc(s.area)}</td>
        <td>${esc(s.yieldTon)}</td>
        <td>${yieldBadge}</td>
        <td>${s.price ? money(s.price) : '—'}</td>
        <td>${seasonRevenue(s) ? money(seasonRevenue(s)) : '—'}</td>
        <td>${s.specialty ? '<span class="chip chip-specialty">Đặc sản</span>' : ''}</td>
        <td>${statusChip(s.status)}</td>
        <td class="row-actions">
          ${canManage(s.region) ? `<button class="btn btn-sm" onclick="openForm(${s.id})">Sửa</button>
            <button class="btn btn-sm btn-danger" onclick="deleteSeason(${s.id})">Xóa</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  }

  document.querySelectorAll('#subview-ql-muavu th.sortable').forEach(th => {
    const key = th.getAttribute('data-sort');
    th.textContent = th.textContent.replace(/ [▲▼]$/, '');
    if(key === sortKey){
      th.textContent += sortDir === 1 ? ' ▲' : ' ▼';
    }
  });
}

function exportCsv(){
  const list = currentFilteredSeasons();
  const header = ['Tên mùa vụ','Cây trồng','Hộ trồng','Ấp','Bắt đầu','Kết thúc','Diện tích (ha)','Sản lượng (tấn)','Năng suất (tấn/ha)','Giá TT (đ/kg)','Giá trị ước tính (đ)','Đặc sản','Trạng thái'];
  const rows = list.map(s => [
    s.name, s.crop, householdName(s.householdId), s.region, s.start || '', s.end || '',
    s.area, s.yieldTon, seasonYieldPerHa(s).toFixed(2), s.price || 0, seasonRevenue(s), s.specialty ? 'Có' : 'Không',
    s.status === 'plan' ? 'Lên kế hoạch' : s.status === 'growing' ? 'Đang canh tác' : 'Đã thu hoạch'
  ]);
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mua-vu-binh-my.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Đã xuất file CSV mùa vụ', 'ok');
}

function renderChart(){
  const ctx = document.getElementById('yieldChart');
  if(!ctx) return;
  if(typeof Chart === 'undefined'){
    ctx.replaceWith(Object.assign(document.createElement('p'), {
      className: 'empty',
      innerHTML: '<svg class="icon"><use href="#icon-sprout"/></svg>Không tải được thư viện biểu đồ (cần kết nối mạng để tải Chart.js).'
    }));
    return;
  }
  const labels = seasons.map(s => s.name);
  const data = seasons.map(s => Number(s.yieldTon || 0));
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Sản lượng (tấn)',
        data,
        backgroundColor: '#2F9E44',
        borderRadius: 6,
        maxBarThickness: 46
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#E3E7DE' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderActivity(){
  const el = document.getElementById('activityList');
  if(!el) return;
  if(activity.length === 0){
    el.innerHTML = '<p class="empty" style="padding:6px 0;"><svg class="icon"><use href="#icon-sprout"/></svg>Chưa có hoạt động nào.</p>';
    return;
  }
  el.innerHTML = activity.map(a => `
    <div class="activity-item">
      <span class="adot"></span>
      <div><div class="atext">${esc(a.text)}</div><div class="atime">${relTime(a.ts)}</div></div>
    </div>`).join('');
}

function safeRender(fn, label){
  try{ fn(); }
  catch(e){ console.error('Lỗi hiển thị (' + (label || fn.name) + '):', e); }
}

function renderAll(){
  safeRender(renderAuthArea);
  safeRender(renderStatsGrid);
  safeRender(renderSmartAlerts);
  safeRender(renderTable);
  safeRender(renderChart);
  safeRender(renderHouseholds);
  safeRender(renderWardSummary);
  safeRender(renderActivity);
  safeRender(renderQuality);
  safeRender(renderOutputs);
  safeRender(renderProcurements);
  safeRender(renderProducts);
}

/* ============ Kiểm định chất lượng ============ */
function seasonLabel(id){
  if(!id) return '—';
  const s = seasons.find(x => x.id === Number(id));
  return s ? s.name : '—';
}

const CERT_STANDARDS = ['VietGAP / Nội địa', 'Siêu thị trong nước', 'Xuất khẩu (GlobalGAP/MRL quốc tế)'];

function seasonCertStatus(seasonId, standard){
  const tests = qualityTests.filter(q => q.seasonId === seasonId && q.standard === standard);
  if(tests.length === 0) return 'none';
  if(tests.some(t => t.result === 'fail')) return 'fail';
  if(tests.some(t => t.result === 'pending')) return 'pending';
  return 'pass';
}

function certChip(status){
  return status === 'pass' ? '<span class="chip chip-pass">Đạt</span>'
    : status === 'fail' ? '<span class="chip chip-fail">Chưa đạt</span>'
    : status === 'pending' ? '<span class="chip chip-pending">Chờ kết quả</span>'
    : '<span class="chip" style="background:#EEE;color:var(--ink-faint);">Chưa kiểm định</span>';
}

function renderCertTable(){
  const body = document.getElementById('certTableBody');
  if(!body) return;
  if(seasons.length === 0){
    body.innerHTML = emptyRow(4, 'Chưa có mùa vụ nào.');
    return;
  }
  body.innerHTML = seasons.map(s => `
    <tr>
      <td>${esc(s.name)}</td>
      <td>${certChip(seasonCertStatus(s.id, 'VietGAP / Nội địa'))}</td>
      <td>${certChip(seasonCertStatus(s.id, 'Siêu thị trong nước'))}</td>
      <td>${certChip(seasonCertStatus(s.id, 'Xuất khẩu (GlobalGAP/MRL quốc tế)'))}</td>
    </tr>`).join('');
}

function resultChip(r){
  return r === 'pass' ? '<span class="chip chip-pass">Đạt</span>'
    : r === 'fail' ? '<span class="chip chip-fail">Không đạt</span>'
    : '<span class="chip chip-pending">Chờ kết quả</span>';
}

function renderQualityStats(){
  const total = qualityTests.length;
  const passCount = qualityTests.filter(q => q.result === 'pass').length;
  const failCount = qualityTests.filter(q => q.result === 'fail').length;
  const pendingCount = qualityTests.filter(q => q.result === 'pending').length;
  const rate = total > 0 ? Math.round((passCount / total) * 100) : 0;
  const exportPassCount = seasons.filter(s => seasonCertStatus(s.id, 'Xuất khẩu (GlobalGAP/MRL quốc tế)') === 'pass').length;
  const supermarketPassCount = seasons.filter(s => seasonCertStatus(s.id, 'Siêu thị trong nước') === 'pass').length;

  const statsEl = document.getElementById('qualityStats');
  if(!statsEl) return;
  statsEl.innerHTML = `
    <div class="stat-card" style="--accent:var(--paddy)"><div class="num-face">${total}</div><div class="lbl">Lượt kiểm định</div></div>
    <div class="stat-card" style="--accent:var(--paddy-deep)"><div class="num-face">${rate}%</div><div class="lbl">Tỷ lệ đạt chuẩn</div></div>
    <div class="stat-card" style="--accent:var(--danger)"><div class="num-face">${failCount}</div><div class="lbl">Không đạt — cần xử lý</div></div>
    <div class="stat-card" style="--accent:var(--papaya)"><div class="num-face">${pendingCount}</div><div class="lbl">Đang chờ kết quả</div></div>
    <div class="stat-card" style="--accent:var(--river)"><div class="num-face">${supermarketPassCount}/${seasons.length}</div><div class="lbl">Mùa vụ đạt chuẩn siêu thị</div></div>
    <div class="stat-card" style="--accent:var(--bloom)"><div class="num-face">${exportPassCount}/${seasons.length}</div><div class="lbl">Mùa vụ đạt chuẩn xuất khẩu</div></div>`;
}

function currentFilteredQuality(){
  const filter = document.getElementById('filterQualityResult')?.value || 'all';
  const std = document.getElementById('filterQualityStandard')?.value || 'all';
  const q = (document.getElementById('searchQuality')?.value || '').trim().toLowerCase();
  let list = filter === 'all' ? qualityTests : qualityTests.filter(x => x.result === filter);
  if(std !== 'all') list = list.filter(x => x.standard === std);
  if(q){
    list = list.filter(x =>
      seasonLabel(x.seasonId).toLowerCase().includes(q) ||
      (x.metric || '').toLowerCase().includes(q) ||
      (x.lab || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderQuality(){
  renderQualityStats();
  renderCertTable();
  const list = currentFilteredQuality();
  const body = document.getElementById('qualityTableBody');
  if(!body) return;
  if(list.length === 0){
    body.innerHTML = emptyRow(9, 'Chưa có dữ liệu kiểm định phù hợp.');
    return;
  }
  body.innerHTML = list.map(q => {
    const pct = q.threshold ? Math.min(150, Math.round((Number(q.value || 0) / Number(q.threshold)) * 100)) : 0;
    const barColor = q.result === 'fail' ? 'var(--danger)' : q.result === 'pending' ? 'var(--papaya)' : 'var(--paddy)';
    return `
      <tr>
        <td><strong>${esc(seasonLabel(q.seasonId))}</strong></td>
        <td>${esc(q.metric)}</td>
        <td>${esc(q.standard) || '—'}</td>
        <td>${esc(q.value)}${q.unit ? ' ' + esc(q.unit) : ''}
          <div class="metric-bar"><div class="metric-bar-fill" style="width:${Math.min(100, pct)}%;background:${barColor}"></div></div>
        </td>
        <td>${q.threshold ? esc(q.threshold) + (q.unit ? ' ' + esc(q.unit) : '') : '—'}</td>
        <td>${esc(q.date)}</td>
        <td>${esc(q.lab)}</td>
        <td>${resultChip(q.result)}</td>
        <td class="row-actions">
          ${canManage(seasonRegion(q.seasonId)) ? `<button class="btn btn-sm" onclick="openQualityForm(${q.id})">Sửa</button>
            <button class="btn btn-sm btn-danger" onclick="deleteQualityTest(${q.id})">Xóa</button>` : ''}
        </td>
      </tr>`;
  }).join('');
}

function openQualityForm(id){
  if(id && !canManage(seasonRegion(qualityTests.find(x => x.id === id)?.seasonId))){
    toast('Bạn không có quyền sửa lần kiểm định này', 'warn');
    return;
  }
  clearFieldErrors('qualityOverlay');
  document.getElementById('qualityOverlay').classList.add('show');
  const seasonSelect = document.getElementById('q_season');
  const allowedSeasons = seasons.filter(s => canManage(s.region));
  seasonSelect.innerHTML = allowedSeasons.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  if(id){
    const q = qualityTests.find(x => x.id === id);
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
    ['q_metric','q_value','q_unit','q_threshold','q_date','q_lab','q_note'].forEach(k => document.getElementById(k).value = '');
    document.getElementById('q_standard').value = 'VietGAP / Nội địa';
    document.getElementById('q_result').value = 'pending';
  }
}

function closeQualityForm(){
  document.getElementById('qualityOverlay').classList.remove('show');
  clearFieldErrors('qualityOverlay');
}

async function saveQualityForm(){
  if(!isAdmin){
    toast('Chỉ cán bộ nông nghiệp có quyền lưu kiểm định', 'warn');
    return;
  }
  clearFieldErrors('qualityOverlay');

  const id = document.getElementById('q_editId').value;
  const seasonIdVal = document.getElementById('q_season').value;
  const metricVal = document.getElementById('q_metric').value.trim();
  const valueVal = document.getElementById('q_value').value.trim();
  const dateVal = document.getElementById('q_date').value;

  let hasErr = false;
  if(!seasonIdVal){
    setFieldError('q_season', 'err_q_season', 'Vui lòng chọn mùa vụ kiểm định.');
    hasErr = true;
  }
  if(!metricVal){
    setFieldError('q_metric', 'err_q_metric', 'Vui lòng nhập tên chỉ tiêu.');
    hasErr = true;
  }
  if(!valueVal || isNaN(Number(valueVal))){
    setFieldError('q_value', 'err_q_value', 'Vui lòng nhập giá trị đo hợp lệ.');
    hasErr = true;
  }
  if(!dateVal){
    setFieldError('q_date', 'err_q_date', 'Vui lòng chọn ngày kiểm nghiệm.');
    hasErr = true;
  }
  if(hasErr) return;

  const record = {
    seasonId: Number(seasonIdVal),
    metric: metricVal,
    value: Number(valueVal),
    unit: document.getElementById('q_unit').value.trim(),
    standard: document.getElementById('q_standard').value,
    threshold: Number(document.getElementById('q_threshold').value || 0),
    date: dateVal,
    lab: document.getElementById('q_lab').value.trim(),
    result: document.getElementById('q_result').value,
    note: document.getElementById('q_note').value.trim()
  };

  if(!canManage(seasonRegion(record.seasonId))){
    toast('Bạn không có quyền phụ trách mùa vụ này', 'warn');
    return;
  }

  setBtnLoading('btnSaveQuality', true);
  try{
    if(id){
      const idx = qualityTests.findIndex(x => x.id === Number(id));
      qualityTests[idx] = { ...qualityTests[idx], ...record };
    }else{
      const newId = qualityTests.length ? Math.max(...qualityTests.map(x => x.id)) + 1 : 1;
      qualityTests.push({ id: newId, ...record });
    }
    await saveQualityTests();
    await logActivity((id ? 'Cập nhật kiểm định: ' : 'Thêm kiểm định mới: ') + record.metric + ' (' + seasonLabel(record.seasonId) + ') — bởi ' + currentUser.user);
    closeQualityForm();
    renderAll();
    toast('Đã lưu kết quả kiểm định', 'ok');
  }catch(e){
    console.error(e);
    toast('Lỗi khi lưu kiểm định: ' + e.message, 'warn');
  }finally{
    setBtnLoading('btnSaveQuality', false);
  }
}

async function deleteQualityTest(id){
  const q = qualityTests.find(x => x.id === id);
  if(!canManage(seasonRegion(q?.seasonId))){
    toast('Bạn không có quyền xóa lần kiểm định này', 'warn');
    return;
  }
  const ok = await showConfirmDialog(
    'Xóa lần kiểm định',
    `Bạn có chắc muốn xóa kết quả kiểm định "${q?.metric}" của ${seasonLabel(q?.seasonId)}?`,
    'Xóa kết quả',
    true
  );
  if(!ok) return;

  qualityTests = qualityTests.filter(x => x.id !== id);
  await saveQualityTests();
  await logActivity('Xóa lần kiểm định: ' + (q ? q.metric : '') + ' — bởi ' + currentUser.user);
  renderAll();
  toast('Đã xóa lần kiểm định', 'warn');
}

/* ============ Đầu ra cho nguồn hàng ============ */
function outputStatusChip(s){
  return s === 'done' ? '<span class="chip chip-out-done">Đã giao hàng</span>'
    : s === 'negotiating' ? '<span class="chip chip-out-negotiating">Đang đàm phán</span>'
    : '<span class="chip chip-out-cancelled">Đã hủy</span>';
}

function outputRevenue(o){
  return Number(o.volume || 0) * 1000 * Number(o.price || 0);
}

function renderOutputStats(){
  const doneList = outputs.filter(o => o.status === 'done');
  const totalVolume = doneList.reduce((a, o) => a + Number(o.volume || 0), 0);
  const totalRevenue = doneList.reduce((a, o) => a + outputRevenue(o), 0);
  const buyerCount = new Set(outputs.map(o => o.buyer)).size;
  const negotiating = outputs.filter(o => o.status === 'negotiating').length;

  const el = document.getElementById('outputStats');
  if(!el) return;
  el.innerHTML = `
    <div class="stat-card" style="--accent:var(--river)"><div class="num-face">${money(totalVolume)}</div><div class="lbl">Tấn đã tiêu thụ</div></div>
    <div class="stat-card" style="--accent:var(--paddy-deep)"><div class="num-face">${(totalRevenue / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr</div><div class="lbl">Doanh thu thực tế</div></div>
    <div class="stat-card" style="--accent:var(--bloom)"><div class="num-face">${buyerCount}</div><div class="lbl">Đối tác thu mua</div></div>
    <div class="stat-card" style="--accent:var(--papaya)"><div class="num-face">${negotiating}</div><div class="lbl">Hợp đồng đang đàm phán</div></div>`;
}

function currentFilteredOutputs(){
  const filterStatus = document.getElementById('filterOutputStatus')?.value || 'all';
  const filterChannel = document.getElementById('filterOutputChannel')?.value || 'all';
  const q = (document.getElementById('searchOutput')?.value || '').trim().toLowerCase();

  let list = filterStatus === 'all' ? outputs : outputs.filter(x => x.status === filterStatus);
  if(filterChannel !== 'all') list = list.filter(x => x.channel === filterChannel);

  if(q){
    list = list.filter(x =>
      seasonLabel(x.seasonId).toLowerCase().includes(q) ||
      (x.buyer || '').toLowerCase().includes(q) ||
      (x.channel || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderOutputs(){
  renderOutputStats();
  const list = currentFilteredOutputs();
  const body = document.getElementById('outputTableBody');
  if(!body) return;
  if(list.length === 0){
    body.innerHTML = emptyRow(9, 'Chưa có dữ liệu đầu ra phù hợp.');
    return;
  }
  body.innerHTML = list.map(o => `
    <tr>
      <td><strong>${esc(seasonLabel(o.seasonId))}</strong></td>
      <td>${esc(o.buyer)}</td>
      <td>${esc(o.channel)}</td>
      <td>${esc(o.volume)}</td>
      <td>${o.price ? money(o.price) : '—'}</td>
      <td>${outputRevenue(o) ? money(outputRevenue(o)) : '—'}</td>
      <td>${esc(o.date)}</td>
      <td>${outputStatusChip(o.status)}</td>
      <td class="row-actions">
        ${canManage(seasonRegion(o.seasonId)) ? `<button class="btn btn-sm" onclick="openOutputForm(${o.id})">Sửa</button>
          <button class="btn btn-sm btn-danger" onclick="deleteOutput(${o.id})">Xóa</button>` : ''}
      </td>
    </tr>`).join('');
}

function openOutputForm(id){
  if(id && !canManage(seasonRegion(outputs.find(x => x.id === id)?.seasonId))){
    toast('Bạn không có quyền sửa mục đầu ra này', 'warn');
    return;
  }
  clearFieldErrors('outputOverlay');
  document.getElementById('outputOverlay').classList.add('show');
  const seasonSelect = document.getElementById('o_season');
  const allowedSeasons = seasons.filter(s => canManage(s.region));
  seasonSelect.innerHTML = allowedSeasons.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');

  if(id){
    const o = outputs.find(x => x.id === id);
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
    ['o_buyer','o_volume','o_price','o_date','o_note'].forEach(k => document.getElementById(k).value = '');
    document.getElementById('o_channel').value = 'Chợ đầu mối';
    document.getElementById('o_status').value = 'negotiating';
  }
}

function closeOutputForm(){
  document.getElementById('outputOverlay').classList.remove('show');
  clearFieldErrors('outputOverlay');
}

async function saveOutputForm(){
  if(!isAdmin){
    toast('Chỉ cán bộ nông nghiệp có quyền lưu thông tin đầu ra', 'warn');
    return;
  }
  clearFieldErrors('outputOverlay');

  const id = document.getElementById('o_editId').value;
  const seasonIdVal = document.getElementById('o_season').value;
  const buyerVal = document.getElementById('o_buyer').value.trim();
  const volumeVal = document.getElementById('o_volume').value.trim();
  const dateVal = document.getElementById('o_date').value;

  let hasErr = false;
  if(!seasonIdVal){
    setFieldError('o_season', 'err_o_season', 'Vui lòng chọn mùa vụ liên quan.');
    hasErr = true;
  }
  if(!buyerVal){
    setFieldError('o_buyer', 'err_o_buyer', 'Vui lòng nhập tên đối tác thu mua.');
    hasErr = true;
  }
  if(!volumeVal || Number(volumeVal) <= 0){
    setFieldError('o_volume', 'err_o_volume', 'Sản lượng tiêu thụ phải lớn hơn 0.');
    hasErr = true;
  }
  if(!dateVal){
    setFieldError('o_date', 'err_o_date', 'Vui lòng chọn ngày giao hàng / ký hợp đồng.');
    hasErr = true;
  }
  if(hasErr) return;

  const record = {
    seasonId: Number(seasonIdVal),
    buyer: buyerVal,
    channel: document.getElementById('o_channel').value,
    volume: Number(volumeVal),
    price: Number(document.getElementById('o_price').value || 0),
    date: dateVal,
    status: document.getElementById('o_status').value,
    note: document.getElementById('o_note').value.trim()
  };

  if(!canManage(seasonRegion(record.seasonId))){
    toast('Bạn không có quyền với mùa vụ này', 'warn');
    return;
  }

  setBtnLoading('btnSaveOutput', true);
  try{
    if(id){
      const idx = outputs.findIndex(x => x.id === Number(id));
      outputs[idx] = { ...outputs[idx], ...record };
    }else{
      const newId = outputs.length ? Math.max(...outputs.map(x => x.id)) + 1 : 1;
      outputs.push({ id: newId, ...record });
    }
    await saveOutputs();
    await logActivity((id ? 'Cập nhật đầu ra: ' : 'Thêm đầu ra mới: ') + record.buyer + ' (' + seasonLabel(record.seasonId) + ') — bởi ' + currentUser.user);
    closeOutputForm();
    renderAll();
    toast('Đã lưu thông tin đầu ra', 'ok');
  }catch(e){
    console.error(e);
    toast('Lỗi khi lưu đầu ra: ' + e.message, 'warn');
  }finally{
    setBtnLoading('btnSaveOutput', false);
  }
}

async function deleteOutput(id){
  const o = outputs.find(x => x.id === id);
  if(!canManage(seasonRegion(o?.seasonId))){
    toast('Bạn không có quyền xóa mục đầu ra này', 'warn');
    return;
  }
  const ok = await showConfirmDialog(
    'Xóa mục đầu ra',
    `Xóa thông tin giao dịch tiêu thụ với bên mua "${o?.buyer}"?`,
    'Xóa giao dịch',
    true
  );
  if(!ok) return;

  outputs = outputs.filter(x => x.id !== id);
  await saveOutputs();
  await logActivity('Xóa đầu ra: ' + (o ? o.buyer : '') + ' — bởi ' + currentUser.user);
  renderAll();
  toast('Đã xóa mục đầu ra', 'warn');
}

/* ============ Tin thu mua nông sản ============ */
function procurementImage(p){ return p.image || p.imageUrl || p.photo || p.photoUrl || p.thumbnail || (Array.isArray(p.images) && p.images[0]) || ''; }
function procurementGroup(p){ const v = `${p.crop || ''} ${p.title || ''}`.toLowerCase(); return /rau|cải|xà lách|dưa leo/.test(v) ? 'vegetable' : /trái|quả|chôm|xoài|sơ ri|cam|ổi/.test(v) ? 'fruit' : 'general'; }
function procurementVisual(p){ const image = procurementImage(p); const group = procurementGroup(p); return image ? `<img src="${esc(image)}" alt="${esc(p.crop || 'Nông sản')}" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('is-placeholder');this.remove()">` : `<span class="proc-placeholder-icon">${group === 'vegetable' ? 'RAU XANH' : group === 'fruit' ? 'TRÁI CÂY' : 'NÔNG SẢN'}</span>`; }
function procurementQuantity(p){ return p.quantity !== undefined && p.quantity !== null && p.quantity !== '' ? `${money(p.quantity)} ${esc(p.unitLabel || 'tấn')}` : 'Theo nhu cầu'; }
function procurementPrice(p){ return Number(p.priceOffer) > 0 ? `${money(p.priceOffer)} đ/kg` : 'Giá thỏa thuận'; }
function openProcDetail(id){ const p = procurements.find(x => x.id === id); if(!p) return; document.getElementById('procDetailContent').innerHTML = `<div class="proc-detail-grid"><div class="proc-detail-media proc-media-${procurementGroup(p)}">${procurementVisual(p)}</div><div class="proc-detail-summary">${procStatusChip(p.status)}<h2 id="procDetailTitle">${esc(p.title)}</h2><div class="proc-detail-quantity">${procurementQuantity(p)}<small>số lượng cần mua</small></div><strong class="proc-detail-price">${procurementPrice(p)}</strong><p>⌖ ${esc(p.ap || 'Bình Mỹ')}</p><p>▣ ${esc(p.buyer || 'Đối tác thu mua')}</p><button class="btn btn-primary" onclick="event.stopPropagation();closeProcDetail();openApplyForm(${p.id})" ${p.status === 'closed' ? 'disabled' : ''}>Liên hệ người mua</button></div></div><div class="proc-detail-info"><h3>Chi tiết nhu cầu</h3><p><b>Cây trồng:</b> ${esc(p.crop || '—')}</p><p><b>Khối lượng:</b> ${procurementQuantity(p)}</p><p><b>Giá chào mua:</b> ${procurementPrice(p)}</p>${p.deadline ? `<p><b>Cần hàng:</b> ${esc(p.deadline)}</p>` : ''}${p.requirement ? `<p><b>Yêu cầu chất lượng:</b> ${esc(p.requirement)}</p>` : ''}${p.note ? `<p><b>Ghi chú:</b> ${esc(p.note)}</p>` : ''}</div>`; document.getElementById('procDetailOverlay').classList.add('show'); }
function closeProcDetail(){ document.getElementById('procDetailOverlay')?.classList.remove('show'); }

function procStatusChip(s){
  return s === 'open' ? '<span class="chip chip-open">Đang tuyển đầu mối</span>' : '<span class="chip chip-closed">Đã đủ nguồn hàng</span>';
}

function daysLeftLabel(deadline){
  if(!deadline) return '';
  const d = new Date(deadline + 'T00:00:00');
  const now = new Date();
  now.setHours(0,0,0,0);
  const diff = Math.round((d - now) / 86400000);
  if(diff < 0) return 'Đã hết hạn';
  if(diff === 0) return 'Hạn chót hôm nay';
  return 'Còn ' + diff + ' ngày';
}

function renderProcStats(){
  const openCount = procurements.filter(p => p.status === 'open').length;
  const totalApplicants = procurements.reduce((a, p) => a + (p.applicants || []).length, 0);
  const cropSet = new Set(procurements.map(p => p.crop)).size;
  const totalQuantity = procurements.filter(p => p.status === 'open').reduce((a, p) => a + Number(p.quantity || 0), 0);

  const el = document.getElementById('procStats');
  if(!el) return;
  el.innerHTML = `
    <div class="stat-card" style="--accent:var(--paddy)"><div class="num-face">${openCount}</div><div class="lbl">Tin đang mở chào hàng</div></div>
    <div class="stat-card" style="--accent:var(--river)"><div class="num-face">${money(totalQuantity)}</div><div class="lbl">Tổng nhu cầu thu mua</div></div>
    <div class="stat-card" style="--accent:var(--bloom)"><div class="num-face">${totalApplicants}</div><div class="lbl">Lượt hộ trồng chào hàng</div></div>
    <div class="stat-card" style="--accent:var(--papaya)"><div class="num-face">${cropSet}</div><div class="lbl">Chủng loại nông sản cần</div></div>`;
}

function currentFilteredProcurements(){
  const filterEl = document.getElementById('filterProcCrop');
  if(filterEl){
    const currentCrop = filterEl.value || 'all';
    const crops = Array.from(new Set(procurements.map(p => p.crop))).sort();
    filterEl.innerHTML = '<option value="all">Tất cả cây trồng</option>' + crops.map(c => `<option value="${esc(c)}" ${c === currentCrop ? 'selected' : ''}>${esc(c)}</option>`).join('');
    if(!Array.from(filterEl.options).some(o => o.value === currentCrop)) filterEl.value = 'all';
  }

  const filter = document.getElementById('filterProcStatus')?.value || 'all';
  const cropFilter = document.getElementById('filterProcCrop')?.value || 'all';
  const q = (document.getElementById('searchProc')?.value || '').trim().toLowerCase();

  let list = filter === 'all' ? procurements : procurements.filter(p => p.status === filter);
  if(cropFilter !== 'all') list = list.filter(p => p.crop === cropFilter);
  if(q){
    list = list.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.crop || '').toLowerCase().includes(q) ||
      (p.buyer || '').toLowerCase().includes(q) ||
      (p.ap || '').toLowerCase().includes(q)
    );
  }
  return [...list].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (b.postedDate || '').localeCompare(a.postedDate || ''));
}

function renderProcurements(){
  renderProcStats();
  const list = currentFilteredProcurements();
  const el = document.getElementById('procList');
  if(!el) return;
  renderProcurementCards(el, list);
  return;
  /* legacy list renderer retained below for compatibility */
  if(list.length === 0){
    el.innerHTML = `<div class="panel empty"><svg class="icon"><use href="#icon-sprout"/></svg>Chưa có tin thu mua phù hợp.</div>`;
    return;
  }
  el.innerHTML = list.map(p => {
    const canEdit = canManageProc(p);
    const applicants = p.applicants || [];
    return `
    <div class="proc-card ${p.status === 'closed' ? 'closed' : ''}">
      <div class="proc-top">
        <div>
          <p class="proc-title">${esc(p.title)}</p>
          <p class="proc-buyer">${esc(p.buyer)}${p.postedDate ? ' · đăng ngày ' + esc(p.postedDate) : ''}</p>
        </div>
        <div class="proc-status">${procStatusChip(p.status)}</div>
      </div>
      <div class="proc-tags">
        <span class="proc-tag accent-river"><svg class="icon" style="width:13px;height:13px;margin-right:3px;"><use href="#icon-seasons"/></svg>${esc(p.crop)}</span>
        <span class="proc-tag accent-papaya">${esc(p.quantity)} ${esc(p.unitLabel || 'tấn')}</span>
        ${p.priceOffer ? `<span class="proc-tag accent-bloom">${money(p.priceOffer)} đ/kg</span>` : `<span class="proc-tag">Giá thỏa thuận</span>`}
        <span class="proc-tag">${esc(p.ap)}</span>
        ${p.deadline ? `<span class="proc-tag">${esc(daysLeftLabel(p.deadline))} (đến ${esc(p.deadline)})</span>` : ''}
      </div>
      ${p.requirement ? `<div class="proc-req"><svg class="icon" style="width:14px;height:14px;"><use href="#icon-quality"/></svg>${esc(p.requirement)}</div>` : ''}
      ${p.note ? `<div class="proc-note">${esc(p.note)}</div>` : ''}
      <div class="proc-bottom">
        <div class="proc-meta">Liên hệ: ${esc(p.contactName) || '—'}${p.contactPhone ? ' · ' + esc(p.contactPhone) : ''} · ${applicants.length} hộ đã gửi chào hàng</div>
        <div class="proc-actions">
          <button class="btn btn-primary btn-sm" onclick="openApplyForm(${p.id})" ${p.status === 'closed' ? 'disabled' : ''}>Gửi chào hàng</button>
          ${applicants.length > 0 ? `<button class="btn btn-sm" onclick="toggleApplicants(${p.id})">Xem hộ chào hàng (${applicants.length})</button>` : ''}
          ${canEdit ? `<button class="btn btn-sm" onclick="openProcForm(${p.id})">Sửa</button>
            <button class="btn btn-sm" onclick="toggleProcStatus(${p.id})">${p.status === 'open' ? 'Đánh dấu đủ hàng' : 'Mở lại tin'}</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProcurement(${p.id})">Xóa</button>` : ''}
        </div>
      </div>
      <div class="applicants-box" id="applicants-${p.id}">
        ${applicants.map(a => `<div class="applicant-item"><strong>${esc(a.name)}</strong> · SĐT: ${esc(a.phone) || '—'} ${a.ap ? '· Ấp: ' + esc(a.ap) : ''}${a.quantity ? ' · Cung cấp: ' + esc(a.quantity) : ''}${a.note ? ' · ' + esc(a.note) : ''}</div>`).join('') || ''}
      </div>
    </div>`;
  }).join('');
}

function renderProcurementCards(el, list){
  if(list.length === 0){ el.innerHTML = `<div class="proc-empty"><svg class="icon"><use href="#icon-sprout"/></svg><h3>Chưa có tin thu mua phù hợp</h3><p>Thử đổi bộ lọc hoặc tìm một nhu cầu khác.</p><button class="btn" onclick="document.getElementById('searchProc').value='';document.getElementById('filterProcStatus').value='all';document.getElementById('filterProcCrop').value='all';renderProcurements()">Xóa bộ lọc</button></div>`; return; }
  el.innerHTML = list.map(p => { const canEdit = canManageProc(p); return `<article class="proc-card ${p.status === 'closed' ? 'closed' : ''}" onclick="openProcDetail(${p.id})" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' ')openProcDetail(${p.id})"><div class="proc-card-media proc-media-${procurementGroup(p)}">${procurementVisual(p)}<div class="proc-status">${procStatusChip(p.status)}</div></div><div class="proc-card-body"><p class="proc-title">${esc(p.title)}</p><div class="proc-quantity"><small>NHU CẦU</small><strong>${procurementQuantity(p)}</strong><span>số lượng cần mua</span></div><div class="proc-price">${procurementPrice(p)}</div><div class="proc-location">⌖ ${esc(p.ap || 'Bình Mỹ')} <span>·</span> ${esc(p.buyer || 'Đối tác thu mua')}</div>${p.deadline ? `<div class="proc-deadline">${esc(daysLeftLabel(p.deadline))}</div>` : ''}<div class="proc-actions"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openApplyForm(${p.id})" ${p.status === 'closed' ? 'disabled' : ''}>Liên hệ người mua</button><button class="btn btn-sm" onclick="event.stopPropagation();openProcDetail(${p.id})">Xem chi tiết</button>${canEdit ? `<button class="btn btn-sm" onclick="event.stopPropagation();openProcForm(${p.id})">Sửa</button><button class="btn btn-sm btn-danger" onclick="event.stopPropagation();deleteProcurement(${p.id})">Xóa</button>` : ''}</div></div></article>`; }).join('');
}

function toggleApplicants(id){
  const box = document.getElementById('applicants-' + id);
  if(box) box.classList.toggle('show');
}

function openProcForm(id){
  if(id && !canManageProc(procurements.find(x => x.id === id))){
    toast('Bạn không có quyền sửa tin thu mua này', 'warn');
    return;
  }
  clearFieldErrors('procOverlay');
  document.getElementById('procOverlay').classList.add('show');
  if(id){
    const p = procurements.find(x => x.id === id);
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
    ['p_title','p_buyer','p_crop','p_ap','p_quantity','p_unitLabel','p_priceOffer','p_requirement','p_deadline','p_contactName','p_contactPhone','p_note'].forEach(k => document.getElementById(k).value = '');
    document.getElementById('p_status').value = 'open';
    if(currentUser && currentUser.role === 'ward') document.getElementById('p_ap').value = currentUser.ap;
    if(currentPersonUser && currentPersonUser.role === 'buyer'){
      document.getElementById('p_buyer').value = currentPersonUser.displayName;
      document.getElementById('p_contactName').value = currentPersonUser.displayName;
      document.getElementById('p_contactPhone').value = currentPersonUser.phone || '';
    }
  }
}

function closeProcForm(){
  document.getElementById('procOverlay').classList.remove('show');
  clearFieldErrors('procOverlay');
}

async function saveProcForm(){
  clearFieldErrors('procOverlay');
  const id = document.getElementById('p_editId').value;
  const titleVal = document.getElementById('p_title').value.trim();
  const buyerVal = document.getElementById('p_buyer').value.trim();
  const cropVal = document.getElementById('p_crop').value.trim();
  const quantityVal = document.getElementById('p_quantity').value.trim();

  let hasErr = false;
  if(!titleVal){
    setFieldError('p_title', 'err_p_title', 'Vui lòng nhập tiêu đề tin thu mua.');
    hasErr = true;
  }
  if(!buyerVal){
    setFieldError('p_buyer', 'err_p_buyer', 'Vui lòng nhập tên đối tác thu mua.');
    hasErr = true;
  }
  if(!cropVal){
    setFieldError('p_crop', 'err_p_crop', 'Vui lòng nhập loại nông sản cần.');
    hasErr = true;
  }
  if(!quantityVal || Number(quantityVal) <= 0){
    setFieldError('p_quantity', 'err_p_quantity', 'Số lượng cần thu mua phải lớn hơn 0.');
    hasErr = true;
  }
  if(hasErr) return;

  const record = {
    title: titleVal,
    buyer: buyerVal,
    crop: cropVal,
    ap: document.getElementById('p_ap').value.trim() || 'Toàn xã Bình Mỹ',
    quantity: Number(quantityVal),
    unitLabel: document.getElementById('p_unitLabel').value.trim() || 'tấn',
    priceOffer: Number(document.getElementById('p_priceOffer').value || 0),
    requirement: document.getElementById('p_requirement').value.trim(),
    deadline: document.getElementById('p_deadline').value,
    contactName: document.getElementById('p_contactName').value.trim(),
    contactPhone: document.getElementById('p_contactPhone').value.trim(),
    note: document.getElementById('p_note').value.trim(),
    status: document.getElementById('p_status').value
  };

  setBtnLoading('btnSaveProc', true);
  try{
    if(id){
      const idx = procurements.findIndex(x => x.id === Number(id));
      procurements[idx] = { ...procurements[idx], ...record };
    }else{
      const newId = procurements.length ? Math.max(...procurements.map(x => x.id)) + 1 : 1;
      const ownerUsername = (currentPersonUser && currentPersonUser.role === 'buyer') ? currentPersonUser.username : (currentUser ? currentUser.user : 'admin');
      procurements.push({
        id: newId,
        postedDate: new Date().toISOString().slice(0, 10),
        applicants: [],
        ownerUsername,
        ...record
      });
    }
    await saveProcurements();
    await logActivity((id ? 'Cập nhật tin thu mua: ' : 'Đăng tin thu mua mới: ') + record.title + ' — bởi ' + actorLabel());
    closeProcForm();
    renderAll();
    toast('Đã lưu tin thu mua thành công', 'ok');
  }catch(e){
    console.error(e);
    toast('Lỗi khi lưu tin: ' + e.message, 'warn');
  }finally{
    setBtnLoading('btnSaveProc', false);
  }
}

async function toggleProcStatus(id){
  const p = procurements.find(x => x.id === id);
  if(!p || !canManageProc(p)){
    toast('Bạn không có quyền thay đổi tin này', 'warn');
    return;
  }
  p.status = p.status === 'open' ? 'closed' : 'open';
  await saveProcurements();
  await logActivity((p.status === 'closed' ? 'Đóng tin thu mua: ' : 'Mở lại tin thu mua: ') + p.title + ' — bởi ' + actorLabel());
  renderAll();
  toast('Đã cập nhật trạng thái tin', 'ok');
}

async function deleteProcurement(id){
  const p = procurements.find(x => x.id === id);
  if(!p || !canManageProc(p)){
    toast('Bạn không có quyền xóa tin này', 'warn');
    return;
  }
  const ok = await showConfirmDialog(
    'Xóa tin thu mua',
    `Xóa tin thu mua "${p?.title}" cùng toàn bộ danh sách chào hàng liên quan?`,
    'Xóa tin',
    true
  );
  if(!ok) return;

  procurements = procurements.filter(x => x.id !== id);
  await saveProcurements();
  await logActivity('Xóa tin thu mua: ' + (p ? p.title : '') + ' — bởi ' + actorLabel());
  renderAll();
  toast('Đã xóa tin thu mua', 'warn');
}

function openApplyForm(id){
  const p = procurements.find(x => x.id === id);
  if(!p) return;
  clearFieldErrors('applyOverlay');
  document.getElementById('ap_procId').value = id;
  document.getElementById('applyForTitle').textContent = 'Gửi thông tin chào hàng cho: "' + p.title + '" — ' + p.buyer;
  ['ap_name','ap_phone','ap_ap','ap_quantity','ap_note'].forEach(fid => document.getElementById(fid).value = '');
  if(currentUser && currentUser.role === 'ward') document.getElementById('ap_ap').value = currentUser.ap;
  if(currentPersonUser && currentPersonUser.role === 'grower'){
    document.getElementById('ap_name').value = currentPersonUser.displayName;
    document.getElementById('ap_phone').value = currentPersonUser.phone || '';
    document.getElementById('ap_ap').value = currentPersonUser.ap || '';
  }
  document.getElementById('applyOverlay').classList.add('show');
}

function closeApplyForm(){
  document.getElementById('applyOverlay').classList.remove('show');
  clearFieldErrors('applyOverlay');
}

async function submitApplication(){
  clearFieldErrors('applyOverlay');
  const id = Number(document.getElementById('ap_procId').value);
  const name = document.getElementById('ap_name').value.trim();
  const phone = document.getElementById('ap_phone').value.trim();

  let hasErr = false;
  if(!name){
    setFieldError('ap_name', 'err_ap_name', 'Vui lòng nhập tên người liên hệ.');
    hasErr = true;
  }
  if(!phone || !/^[0-9+\s\-()]{8,15}$/.test(phone)){
    setFieldError('ap_phone', 'err_ap_phone', 'Vui lòng nhập số điện thoại hợp lệ.');
    hasErr = true;
  }
  if(hasErr) return;

  const payload = {
    procId: id,
    name,
    phone,
    ap: document.getElementById('ap_ap').value.trim(),
    quantity: document.getElementById('ap_quantity').value.trim(),
    note: document.getElementById('ap_note').value.trim()
  };

  setBtnLoading('btnSubmitApply', true);
  try{
    try{
      await httpsCallable(functions, 'submitProcurementApplication')(payload);
    }catch(cfErr){
      // Chế độ dự phòng khi backend Cloud Function chưa cấu hình
      const targetProc = procurements.find(p => p.id === id);
      if(targetProc){
        if(!targetProc.applicants) targetProc.applicants = [];
        targetProc.applicants.push({
          name: payload.name,
          phone: payload.phone,
          ap: payload.ap,
          quantity: payload.quantity,
          note: payload.note,
          appliedAt: new Date().toISOString()
        });
        await saveProcurements();
      }
    }
    closeApplyForm();
    renderAll();
    toast('Đã gửi thông tin chào hàng, đối tác sẽ liên hệ với bạn', 'ok');
  }catch(e){
    console.error('Lỗi gửi chào hàng:', e);
    toast('Không gửi được, vui lòng thử lại: ' + (e.message || ''), 'warn');
  }finally{
    setBtnLoading('btnSubmitApply', false);
  }
}

/* ============ Chợ nông sản Bình Mỹ (Sản phẩm đang bán & Truy xuất QR) ============ */
function certChipProduct(cert){
  if(cert === 'VietGAP') return '<span class="chip chip-pass">VietGAP</span>';
  if(cert === 'Xuất khẩu (GlobalGAP)') return '<span class="chip" style="background:var(--bloom-tint);color:var(--bloom-deep);">Xuất khẩu (GlobalGAP)</span>';
  return '<span class="chip" style="background:#EEE;color:var(--ink-faint);">Chưa có chứng nhận</span>';
}

function productStatusChip(s){
  return s === 'available' ? '<span class="chip chip-open">✅ Còn hàng</span>' : '<span class="chip chip-closed">ℹ️ Hết hàng</span>';
}

function getProductImage(p){
  if(!p) return '';
  if(typeof p.image === 'string' && p.image.trim()) return p.image.trim();
  if(typeof p.imageUrl === 'string' && p.imageUrl.trim()) return p.imageUrl.trim();
  if(typeof p.photoUrl === 'string' && p.photoUrl.trim()) return p.photoUrl.trim();
  if(typeof p.photo === 'string' && p.photo.trim()) return p.photo.trim();
  if(typeof p.thumbnail === 'string' && p.thumbnail.trim()) return p.thumbnail.trim();
  if(Array.isArray(p.images) && p.images.length > 0 && typeof p.images[0] === 'string' && p.images[0].trim()) return p.images[0].trim();
  return '';
}

function getProductImages(p){
  if(!p) return [];
  const list = [];
  if(Array.isArray(p.images)){
    p.images.forEach(img => {
      if(typeof img === 'string' && img.trim() && !list.includes(img.trim())) list.push(img.trim());
    });
  }
  ['image', 'imageUrl', 'photoUrl', 'photo', 'thumbnail'].forEach(key => {
    if(typeof p[key] === 'string' && p[key].trim() && !list.includes(p[key].trim())){
      list.push(p[key].trim());
    }
  });
  return list;
}

// Đối chiếu sản phẩm với kết quả kiểm định thực tế trong cơ sở dữ liệu
function getProductQualityTests(p){
  if(!p) return [];
  const pName = removeVietnameseTones(p.name);
  const pBatch = removeVietnameseTones(p.batchCode || '');
  const pCode = removeVietnameseTones(p.productCode || '');
  return qualityTests.filter(q => {
    const season = seasons.find(s => s.id === Number(q.seasonId));
    const sName = season ? removeVietnameseTones(season.name) : '';
    const sCrop = season ? removeVietnameseTones(season.crop) : '';
    return (sName && pName && (sName.includes(pName) || pName.includes(sName))) ||
           (sCrop && pName && (sCrop.includes(pName) || pName.includes(sCrop))) ||
           (pBatch && sName && sName.includes(pBatch)) ||
           (pCode && sName && sName.includes(pCode));
  });
}

function renderProductStats(){
  const availableCount = products.filter(p => p.status === 'available').length;
  const certCount = products.filter(p => p.certification && p.certification !== 'Chưa kiểm định' && p.certification !== 'Chưa có chứng nhận').length;
  const qrCount = products.filter(p => p.productCode || p.qrCode).length;
  const buyerCount = products.reduce((a, p) => a + (p.buyRequests || []).length, 0);

  const el = document.getElementById('productStats');
  if(!el) return;
  el.innerHTML = `
    <div class="stat-card" style="--accent:var(--paddy)"><div class="num-face">${availableCount}</div><div class="lbl">Sản phẩm đang bán</div></div>
    <div class="stat-card" style="--accent:var(--river)"><div class="num-face">${certCount}</div><div class="lbl">Sản phẩm có chứng nhận</div></div>
    <div class="stat-card" style="--accent:var(--bloom)"><div class="num-face">${qrCount}</div><div class="lbl">Mã QR truy xuất sẵn sàng</div></div>
    <div class="stat-card" style="--accent:var(--papaya)"><div class="num-face">${buyerCount}</div><div class="lbl">Lượt khách liên hệ mua</div></div>`;
}

let mobileActiveFilter = 'all';

function renderMobileHomeStats(){
  const mStatProducts = document.getElementById('mStatProducts');
  const mStatTested = document.getElementById('mStatTested');
  const mStatAvailable = document.getElementById('mStatAvailable');
  
  const totalCount = products.length;
  const availableCount = products.filter(p => p.status === 'available').length;
  const testedCount = products.filter(p => (p.certification && p.certification !== 'Chưa kiểm định' && p.certification !== 'Chưa có chứng nhận') || getProductQualityTests(p).length > 0).length;

  if(mStatProducts) mStatProducts.textContent = totalCount;
  if(mStatTested) mStatTested.textContent = testedCount;
  if(mStatAvailable) mStatAvailable.textContent = availableCount;
}

function clearMobileSearch(){
  const inp = document.getElementById('mobileSearchInput');
  if(inp){
    inp.value = '';
    const clearBtn = document.getElementById('mobileSearchClear');
    if(clearBtn) clearBtn.style.display = 'none';
    renderProducts();
  }
}

function clearAllProductFilters(){
  const search = document.getElementById('searchProduct');
  if(search) search.value = '';
  const mSearch = document.getElementById('mobileSearchInput');
  if(mSearch) mSearch.value = '';
  const clearBtn = document.getElementById('mobileSearchClear');
  if(clearBtn) clearBtn.style.display = 'none';

  ['filterProductName', 'filterProductStatus', 'filterProductQuality', 'filterProductCert'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = 'all';
  });

  const chips = document.getElementById('mobileFilterChips');
  if(chips){
    chips.querySelectorAll('.m-chip').forEach(c => c.classList.remove('active'));
    chips.querySelector('.m-chip[data-filter="all"]')?.classList.add('active');
  }
  mobileActiveFilter = 'all';
  renderProducts();
}

function setupMobileFilterChips(){
  const container = document.getElementById('mobileFilterChips');
  if(!container || container.dataset.initialized) return;
  container.dataset.initialized = 'true';
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.m-chip');
    if(!btn) return;
    container.querySelectorAll('.m-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    mobileActiveFilter = btn.dataset.filter || 'all';
    renderProducts();
  });
}

function currentFilteredProducts(){
  const nameFilterEl = document.getElementById('filterProductName');
  if(nameFilterEl){
    const currentName = nameFilterEl.value || 'all';
    const names = Array.from(new Set(products.map(p => p.name).filter(Boolean))).sort();
    nameFilterEl.innerHTML = '<option value="all">Tất cả loại nông sản</option>' + names.map(n => `<option value="${esc(n)}" ${n === currentName ? 'selected' : ''}>${esc(n)}</option>`).join('');
    if(!Array.from(nameFilterEl.options).some(o => o.value === currentName)) nameFilterEl.value = 'all';
  }

  const nameFilter = document.getElementById('filterProductName')?.value || 'all';
  const statusFilter = document.getElementById('filterProductStatus')?.value || 'all';
  const qualityFilter = document.getElementById('filterProductQuality')?.value || 'all';
  const certFilter = document.getElementById('filterProductCert')?.value || 'all';
  
  const desktopSearch = (document.getElementById('searchProduct')?.value || '').trim();
  const mobileSearch = (document.getElementById('mobileSearchInput')?.value || '').trim();
  const rawQ = mobileSearch || desktopSearch;
  const qNorm = removeVietnameseTones(rawQ);

  let list = [...products];
  if(nameFilter !== 'all') list = list.filter(p => p.name === nameFilter);
  if(statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
  
  if(qualityFilter === 'tested'){
    list = list.filter(p => (p.certification && p.certification !== 'Chưa kiểm định' && p.certification !== 'Chưa có chứng nhận') || getProductQualityTests(p).length > 0);
  }else if(qualityFilter === 'untested'){
    list = list.filter(p => (!p.certification || p.certification === 'Chưa kiểm định' || p.certification === 'Chưa có chứng nhận') && getProductQualityTests(p).length === 0);
  }

  if(certFilter !== 'all'){
    if(certFilter === 'Chưa kiểm định'){
      list = list.filter(p => !p.certification || p.certification === 'Chưa kiểm định' || p.certification === 'Chưa có chứng nhận');
    }else{
      list = list.filter(p => p.certification === certFilter);
    }
  }

  // Bộ lọc chip dành riêng cho Mobile
  if(mobileActiveFilter === 'available'){
    list = list.filter(p => p.status === 'available');
  }else if(mobileActiveFilter === 'tested'){
    list = list.filter(p => (p.certification && p.certification !== 'Chưa kiểm định' && p.certification !== 'Chưa có chứng nhận') || getProductQualityTests(p).length > 0);
  }else if(mobileActiveFilter === 'VietGAP'){
    list = list.filter(p => (p.certification || '').includes('VietGAP'));
  }else if(mobileActiveFilter === 'ap-bonphu'){
    list = list.filter(p => {
      const ap = removeVietnameseTones(p.ap || '');
      return ap.includes('bon phu');
    });
  }else if(mobileActiveFilter === 'ap-anhoa'){
    list = list.filter(p => {
      const ap = removeVietnameseTones(p.ap || '');
      return ap.includes('an hoa');
    });
  }

  if(qNorm){
    list = list.filter(p => {
      const name = removeVietnameseTones(p.name);
      const seller = removeVietnameseTones(p.sellerName);
      const ap = removeVietnameseTones(p.ap);
      const code = removeVietnameseTones(p.productCode);
      const batch = removeVietnameseTones(p.batchCode);
      const qr = removeVietnameseTones(p.qrCode);
      const cert = removeVietnameseTones(p.certification);
      return name.includes(qNorm) || seller.includes(qNorm) || ap.includes(qNorm) ||
             code.includes(qNorm) || batch.includes(qNorm) || qr.includes(qNorm) || cert.includes(qNorm);
    });
  }

  return list.sort((a, b) => (a.status === 'available' ? 0 : 1) - (b.status === 'available' ? 0 : 1) || (b.postedDate || '').localeCompare(a.postedDate || ''));
}

function renderProducts(){
  renderProductStats();
  renderMobileHomeStats();
  setupMobileFilterChips();
  
  const list = currentFilteredProducts();
  const gridContainer = document.getElementById('productMarketplaceGrid') || document.getElementById('mobileProductCards');
  const desktopTableBody = document.getElementById('desktopProductTableBody');
  const mobileCards = document.getElementById('mobileProductCards');
  const homePreviewEl = document.getElementById('mobileHomeProductPreview');
  const countLabel = document.getElementById('mobileProductCountLabel');
  const desktopCountLabel = document.getElementById('desktopProductCountLabel');

  const availableCount = products.filter(p => p.status === 'available').length;
  const countText = `Hiển thị ${list.length} nông sản (${availableCount} đang bán)`;
  if(countLabel) countLabel.textContent = countText;
  if(desktopCountLabel) desktopCountLabel.textContent = countText;

  // 1. Render Mobile Home Preview (Top 3 nông sản mới nhất trên Trang chủ Mobile)
  if(homePreviewEl){
    const previewItems = products.filter(p => p.status === 'available').slice(0, 3);
    if(previewItems.length === 0){
      homePreviewEl.innerHTML = '<div style="text-align:center;color:var(--ink-soft);padding:14px;background:var(--surface);border-radius:12px;font-size:13px;">Chưa có nông sản mới. Bà con có thể đăng bán ngay!</div>';
    } else {
      homePreviewEl.innerHTML = previewItems.map(p => {
        const img = getProductImage(p);
        return `
          <div class="mobile-action-card mobile-home-prod-card" onclick="showProductDetail(${p.id})" style="cursor:pointer;">
            <div class="action-card-img-thumb">
              ${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" class="m-home-thumb" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML='<span class=\\'thumb-sprout\\'>🌱</span>';">` : '<span class="thumb-sprout">🌱</span>'}
            </div>
            <div class="action-card-text" style="flex:1;min-width:0;">
              <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${esc(p.name)}</strong>
              <span style="font-size:12px;color:var(--ink-soft);">${esc(p.sellerName || 'Hộ vườn')} · ${esc(p.ap || 'Bình Mỹ')}</span>
              <div style="font-size:13.5px;font-weight:700;color:var(--paddy-deep);font-family:'Space Grotesk',sans-serif;margin-top:2px;">
                ${money(p.price)} đ/${esc(p.unitLabel || 'kg')}
              </div>
            </div>
            <div style="color:var(--paddy-deep);font-weight:700;font-size:12.5px;flex:none;">
              Xem →
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Xử lý trạng thái rỗng
  if(list.length === 0){
    const emptyHtml = `
      <div class="empty-product-state" style="padding:48px 16px;text-align:center;grid-column:1/-1;width:100%;">
        <div style="font-size:42px;margin-bottom:8px;">🌱</div>
        <div style="font-weight:700;font-size:18px;margin-bottom:6px;color:var(--ink);">Chưa tìm thấy sản phẩm</div>
        <p style="color:var(--ink-soft);font-size:13.5px;max-width:440px;margin:0 auto 16px;line-height:1.5;">
          Thử đổi từ khóa hoặc bỏ bớt bộ lọc để tìm thấy các loại nông sản khác đang có sẵn tại Bình Mỹ.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" onclick="clearAllProductFilters()">
            <svg class="icon icon-14"><use href="#icon-refresh"/></svg> Xóa bộ lọc
          </button>
          <button type="button" class="btn" onclick="handleOpenProductForm()">
            <svg class="icon icon-14"><use href="#icon-plus"/></svg> Đăng sản phẩm mới
          </button>
        </div>
      </div>`;
    if(gridContainer) gridContainer.innerHTML = emptyHtml;
    if(desktopTableBody) desktopTableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;">${emptyHtml}</td></tr>`;
    if(mobileCards && mobileCards !== gridContainer) mobileCards.innerHTML = emptyHtml;
    return;
  }

  // 3. Render Marketplace Cards Grid (Modern Product Marketplace Layout)
  const cardsHtml = list.map(p => {
    const canEdit = canManageProduct(p);
    const tests = getProductQualityTests(p);
    const isTested = tests.length > 0 || (p.certification && p.certification !== 'Chưa kiểm định' && p.certification !== 'Chưa có chứng nhận');
    const img = getProductImage(p);
    const isAvailable = p.status === 'available';
    const isLowStock = isAvailable && p.quantity > 0 && p.quantity <= 30;

    // Badges
    let certBadgeHtml = '';
    if(p.certification && p.certification.includes('VietGAP')){
      certBadgeHtml = '<span class="card-badge badge-vietgap">✓ VietGAP</span>';
    } else if(p.certification && p.certification.includes('GlobalGAP')){
      certBadgeHtml = '<span class="card-badge badge-globalgap">✓ Xuất khẩu</span>';
    } else if(isTested){
      certBadgeHtml = `<span class="card-badge badge-tested">✓ Đã kiểm (${tests.length > 0 ? tests.length + ' tiêu chí' : 'Đạt'})</span>`;
    }

    let stockBadgeHtml = '';
    if(!isAvailable){
      stockBadgeHtml = '<span class="card-badge badge-soldout">Hết hàng</span>';
    } else if(isLowStock){
      stockBadgeHtml = '<span class="card-badge badge-lowstock">Sắp hết</span>';
    } else {
      stockBadgeHtml = '<span class="card-badge badge-available">Còn hàng</span>';
    }

    const qrBadgeHtml = p.productCode || p.qrCode
      ? `<span class="card-badge badge-qr" title="Mã QR tra cứu nguồn gốc"><svg class="icon icon-12"><use href="#icon-qr-code"/></svg> QR</span>`
      : '';

    // Quality line
    let qualityTextHtml = '';
    if(p.certification && p.certification !== 'Chưa kiểm định' && p.certification !== 'Chưa có chứng nhận'){
      qualityTextHtml = `<span class="cert-text-ok">✓ ${esc(p.certification)}</span>`;
    } else if(isTested){
      qualityTextHtml = `<span class="cert-text-ok">✓ Đã kiểm định an toàn</span>`;
    } else {
      qualityTextHtml = `<span class="cert-text-muted">Chưa có thông tin kiểm định</span>`;
    }

    return `
      <div class="product-card ${!isAvailable ? 'is-soldout' : ''}" onclick="showProductDetail(${p.id})" title="Bấm xem chi tiết ${esc(p.name)}">
        <div class="product-card-img-wrap">
          <div class="card-badges-top-left">
            ${certBadgeHtml}
            ${qrBadgeHtml}
          </div>
          <div class="card-badges-top-right">
            ${stockBadgeHtml}
          </div>
          ${img ? `
            <img
              src="${esc(img)}"
              alt="${esc(p.name)}"
              loading="lazy"
              decoding="async"
              class="product-card-image"
              onerror="this.onerror=null;this.parentElement.querySelector('.product-image-placeholder')?.remove();this.insertAdjacentHTML('afterend','<div class=\\'product-image-placeholder\\'><span>🌱</span><small>Chưa có ảnh</small></div>');this.style.display='none';">
          ` : `
            <div class="product-image-placeholder">
              <span>🌱</span>
              <small>Chưa có ảnh sản phẩm</small>
            </div>
          `}
        </div>

        <div class="product-card-body">
          <h3 class="product-card-title">${esc(p.name)}</h3>
          
          <div class="product-card-price">
            ${money(p.price)} đ<span class="product-card-unit">/${esc(p.unitLabel || 'kg')}</span>
          </div>

          <div class="product-card-stock">
            ${isAvailable ? `📦 Còn <strong>${esc(p.quantity)} ${esc(p.unitLabel || 'kg')}</strong>` : '<span class="text-danger" style="font-weight:600;">Hết hàng</span>'}
          </div>

          <div class="product-card-cert">
            ${qualityTextHtml}
          </div>

          <div class="product-card-origin" title="${esc(p.ap || 'Xã Bình Mỹ')} · ${esc(p.sellerName || 'Hộ vườn')}">
            <svg class="icon icon-14" style="flex:none;"><use href="#icon-map-pin"/></svg>
            <span>${esc(p.ap || 'Xã Bình Mỹ')} · ${esc(p.sellerName || 'Hộ vườn')}</span>
          </div>

          <div class="product-card-actions">
            <button type="button" class="btn btn-sm btn-card-detail" onclick="event.stopPropagation();showProductDetail(${p.id})">
              <svg class="icon icon-14"><use href="#icon-eye"/></svg> Xem
            </button>
            <button type="button" class="btn btn-sm btn-primary btn-card-buy" onclick="event.stopPropagation();openBuyForm(${p.id})" ${!isAvailable ? 'disabled' : ''}>
              <svg class="icon icon-14"><use href="#icon-phone"/></svg> Mua
            </button>
          </div>

          ${canEdit ? `
            <div class="product-card-admin-row" onclick="event.stopPropagation();">
              <button type="button" class="btn-card-admin" onclick="openProductForm(${p.id})" title="Chỉnh sửa thông tin">Sửa</button>
              <button type="button" class="btn-card-admin" onclick="toggleProductStatus(${p.id})" title="Đổi trạng thái">${isAvailable ? 'Tạm ngưng' : 'Mở bán'}</button>
              <button type="button" class="btn-card-admin text-danger" onclick="deleteProduct(${p.id})" title="Xóa mặt hàng">Xóa</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  if(gridContainer) gridContainer.innerHTML = cardsHtml;
  if(mobileCards && mobileCards !== gridContainer) mobileCards.innerHTML = cardsHtml;
  if(desktopTableBody) desktopTableBody.innerHTML = '';
}

function toggleBuyers(id){
  const box = document.getElementById('buyers-' + id);
  if(box) box.classList.toggle('show');
}

function previewProductFormImage(url){
  const box = document.getElementById('pr_image_preview_box');
  const img = document.getElementById('pr_image_preview');
  const err = document.getElementById('pr_image_err');
  if(!box || !img) return;
  if(err) err.style.display = 'none';

  if(url && typeof url === 'string' && url.trim()){
    img.src = url.trim();
    box.style.display = 'block';
  }else{
    box.style.display = 'none';
    img.src = '';
  }
}

function handleProductFormImgError(){
  const box = document.getElementById('pr_image_preview_box');
  const err = document.getElementById('pr_image_err');
  if(box) box.style.display = 'none';
  if(err) err.style.display = 'block';
}

function clearProductFormImage(){
  const input = document.getElementById('pr_image');
  if(input) input.value = '';
  previewProductFormImage('');
}

function handleOpenProductForm(){
  if(!currentUser && (!currentPersonUser || currentPersonUser.role !== 'grower')){
    openPersonAuth();
    toast('Vui lòng đăng nhập tài khoản hộ trồng để đăng bán sản phẩm', 'warn');
    return;
  }
  openProductForm();
}

function openProductForm(id){
  if(id && !canManageProduct(products.find(x => x.id === id))){
    toast('Bạn không có quyền chỉnh sửa sản phẩm này', 'warn');
    return;
  }
  clearFieldErrors('productOverlay');
  document.getElementById('productOverlay').classList.add('show');
  
  if(id){
    const p = products.find(x => x.id === id);
    document.getElementById('productFormTitle').textContent = 'Sửa thông tin sản phẩm';
    document.getElementById('pr_editId').value = id;
    document.getElementById('pr_productCode').value = p.productCode || ('BM-2026-' + String(p.id).padStart(3, '0'));
    document.getElementById('pr_batchCode').value = p.batchCode || '';
    document.getElementById('pr_name').value = p.name || '';
    document.getElementById('pr_seller').value = p.sellerName || '';
    document.getElementById('pr_ap').value = p.ap || 'Ấp Bốn Phú';
    document.getElementById('pr_quantity').value = p.quantity || '';
    document.getElementById('pr_unitLabel').value = p.unitLabel || 'kg';
    document.getElementById('pr_price').value = p.price || '';
    document.getElementById('pr_harvestDate').value = p.harvestDate || p.postedDate || '';
    document.getElementById('pr_certification').value = p.certification || 'Chưa kiểm định';
    document.getElementById('pr_contactName').value = p.contactName || '';
    document.getElementById('pr_contactPhone').value = p.contactPhone || '';
    document.getElementById('pr_note').value = p.note || '';
    document.getElementById('pr_status').value = p.status || 'available';

    const imgVal = getProductImage(p);
    const imgInput = document.getElementById('pr_image');
    if(imgInput) imgInput.value = imgVal || '';
    previewProductFormImage(imgVal);
  }else{
    document.getElementById('productFormTitle').textContent = 'Đăng sản phẩm bán mới';
    document.getElementById('pr_editId').value = '';
    const nextId = products.length ? Math.max(...products.map(x => Number(x.id) || 0)) + 1 : 1;
    document.getElementById('pr_productCode').value = 'BM-' + new Date().getFullYear() + '-' + String(nextId).padStart(3, '0');
    document.getElementById('pr_batchCode').value = 'LÔ-' + String(nextId).padStart(2, '0');
    document.getElementById('pr_harvestDate').value = new Date().toISOString().slice(0, 10);
    
    ['pr_name','pr_seller','pr_ap','pr_quantity','pr_price','pr_contactName','pr_contactPhone','pr_note','pr_image'].forEach(k => {
      const el = document.getElementById(k);
      if(el) el.value = '';
    });
    previewProductFormImage('');
    document.getElementById('pr_unitLabel').value = 'kg';
    document.getElementById('pr_certification').value = 'Chưa kiểm định';
    document.getElementById('pr_status').value = 'available';

    if(currentUser && currentUser.role === 'ward') document.getElementById('pr_ap').value = currentUser.ap;
    if(currentPersonUser && currentPersonUser.role === 'grower'){
      document.getElementById('pr_seller').value = currentPersonUser.displayName;
      document.getElementById('pr_contactName').value = currentPersonUser.displayName;
      document.getElementById('pr_contactPhone').value = currentPersonUser.phone || '';
      document.getElementById('pr_ap').value = currentPersonUser.ap || 'Ấp Bốn Phú';
    }
  }
}

function closeProductForm(){
  document.getElementById('productOverlay').classList.remove('show');
  clearFieldErrors('productOverlay');
}

async function saveProductForm(){
  clearFieldErrors('productOverlay');
  const id = document.getElementById('pr_editId').value;
  const nameVal = document.getElementById('pr_name').value.trim();
  const sellerVal = document.getElementById('pr_seller').value.trim();
  const quantityVal = document.getElementById('pr_quantity').value.trim();
  const priceVal = document.getElementById('pr_price').value.trim();
  let codeVal = document.getElementById('pr_productCode').value.trim().toUpperCase();
  const batchVal = document.getElementById('pr_batchCode').value.trim().toUpperCase();
  const harvestVal = document.getElementById('pr_harvestDate').value;
  const imgVal = document.getElementById('pr_image')?.value.trim() || '';

  let hasErr = false;
  if(!nameVal){
    setFieldError('pr_name', 'err_pr_name', 'Vui lòng nhập tên nông sản (VD: Chôm chôm, Sơ ri, Cà chua).');
    hasErr = true;
  }
  if(!sellerVal){
    setFieldError('pr_seller', 'err_pr_seller', 'Vui lòng nhập tên người bán hoặc hộ trồng.');
    hasErr = true;
  }
  if(!quantityVal || Number(quantityVal) <= 0){
    setFieldError('pr_quantity', 'err_pr_quantity', 'Khối lượng bán phải lớn hơn 0.');
    hasErr = true;
  }
  if(!priceVal || Number(priceVal) < 0){
    setFieldError('pr_price', 'err_pr_price', 'Vui lòng nhập giá bán hợp lệ.');
    hasErr = true;
  }
  if(hasErr) return;

  const newId = id ? Number(id) : (products.length ? Math.max(...products.map(x => Number(x.id) || 0)) + 1 : 1);
  if(!codeVal){
    codeVal = 'BM-' + new Date().getFullYear() + '-' + String(newId).padStart(3, '0');
  }

  const record = {
    productCode: codeVal,
    batchCode: batchVal || ('LÔ-' + String(newId).padStart(2, '0')),
    name: nameVal,
    sellerName: sellerVal,
    ap: document.getElementById('pr_ap').value.trim() || 'Xã Bình Mỹ',
    quantity: Number(quantityVal),
    unitLabel: document.getElementById('pr_unitLabel').value.trim() || 'kg',
    price: Number(priceVal),
    harvestDate: harvestVal || new Date().toISOString().slice(0, 10),
    certification: document.getElementById('pr_certification').value,
    contactName: document.getElementById('pr_contactName').value.trim() || sellerVal,
    contactPhone: document.getElementById('pr_contactPhone').value.trim(),
    note: document.getElementById('pr_note').value.trim(),
    image: imgVal,
    imageUrl: imgVal,
    status: document.getElementById('pr_status').value,
    qrCode: `${window.location.origin}${window.location.pathname}#san-pham=${encodeURIComponent(codeVal)}`
  };

  setBtnLoading('pr_saveBtn', true);
  try{
    if(id){
      const idx = products.findIndex(x => x.id === Number(id));
      products[idx] = { ...products[idx], ...record };
    }else{
      const ownerUsername = (currentPersonUser && currentPersonUser.role === 'grower')
        ? currentPersonUser.username
        : (currentUser ? currentUser.user : 'admin');

      products.push({
        id: newId,
        postedDate: new Date().toISOString().slice(0, 10),
        buyRequests: [],
        ownerUsername,
        ...record
      });
    }
    await saveProducts();
    await logActivity((id ? 'Cập nhật sản phẩm: ' : 'Đăng bán sản phẩm mới: ') + record.name + ' — bởi ' + actorLabel());
    closeProductForm();
    renderAll();
    toast('✅ Đã lưu sản phẩm thành công', 'ok');
  }catch(e){
    console.error(e);
    toast('Không thể lưu sản phẩm: ' + (e.message || 'Lỗi kết nối'), 'warn');
  }finally{
    setBtnLoading('pr_saveBtn', false);
  }
}

async function toggleProductStatus(id){
  const p = products.find(x => x.id === id);
  if(!p || !canManageProduct(p)){
    toast('Bạn không có quyền sửa sản phẩm này', 'warn');
    return;
  }
  p.status = p.status === 'available' ? 'soldout' : 'available';
  await saveProducts();
  await logActivity((p.status === 'soldout' ? 'Đánh dấu hết hàng: ' : 'Mở bán lại: ') + p.name + ' — bởi ' + actorLabel());
  renderAll();
  toast('Đã cập nhật trạng thái sản phẩm', 'ok');
}

async function deleteProduct(id){
  const p = products.find(x => x.id === id);
  if(!p || !canManageProduct(p)){
    toast('Bạn không có quyền xóa sản phẩm này', 'warn');
    return;
  }
  const ok = await showConfirmDialog(
    'Xóa sản phẩm nông sản',
    `Bạn có chắc chắn muốn xóa mặt hàng "${p?.name}" (Mã: ${p?.productCode || p?.id})?`,
    'Xóa mặt hàng',
    true
  );
  if(!ok) return;

  products = products.filter(x => x.id !== id);
  await saveProducts();
  await logActivity('Xóa sản phẩm bán: ' + (p ? p.name : '') + ' — bởi ' + actorLabel());
  renderAll();
  toast('✅ Đã xóa sản phẩm', 'warn');
}

/* ============ QUÉT QR BẰNG CAMERA & TRA CỨU MÃ THỦ CÔNG ============ */
let html5QrScannerInstance = null;
let currentFacingMode = "environment";

async function openQrScanner(){
  const overlay = document.getElementById('qrScanOverlay');
  if(!overlay) return;
  overlay.classList.add('show');
  
  const notice = document.getElementById('qrCameraNotice');
  if(notice) notice.style.display = 'none';

  const inputManual = document.getElementById('manualProductCode');
  if(inputManual) inputManual.value = '';

  // Khởi động Html5Qrcode nếu có thư viện
  if(typeof Html5Qrcode !== 'undefined'){
    try{
      if(html5QrScannerInstance){
        try{ await html5QrScannerInstance.stop(); }catch(ignore){}
        try{ await html5QrScannerInstance.clear(); }catch(ignore){}
      }
      html5QrScannerInstance = new Html5Qrcode("qrReader");
      await html5QrScannerInstance.start(
        { facingMode: currentFacingMode },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          handleQrScanned(decodedText);
        },
        () => {}
      );
    }catch(err){
      console.warn("Lỗi camera scanner:", err);
      if(notice){
        notice.style.display = 'block';
        notice.innerHTML = `⚠️ <strong>Chưa bật được camera:</strong> Bạn chưa cho phép sử dụng camera hoặc thiết bị không có camera. Hãy bấm Cho phép trên trình duyệt hoặc nhập mã sản phẩm bên dưới để tra cứu ngay.`;
      }
    }
  }else{
    if(notice){
      notice.style.display = 'block';
      notice.innerHTML = `ℹ️ Đang tải máy quét... Nếu camera không mở, bạn vui lòng nhập mã sản phẩm bên dưới.`;
    }
  }
}

async function closeQrScanner(){
  const overlay = document.getElementById('qrScanOverlay');
  if(overlay) overlay.classList.remove('show');
  if(html5QrScannerInstance){
    try{
      await html5QrScannerInstance.stop();
      await html5QrScannerInstance.clear();
    }catch(ignore){}
    html5QrScannerInstance = null;
  }
}

async function switchCameraFacing(){
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  toast('Đang chuyển đổi camera...', 'ok');
  await openQrScanner();
}

function handleQrScanned(rawText){
  if(navigator.vibrate) navigator.vibrate(100);
  closeQrScanner();

  // Bóc tách mã từ URL nếu quét URL
  let code = String(rawText || '').trim();
  if(code.includes('#san-pham=')){
    code = code.split('#san-pham=')[1].split('&')[0];
  }else if(code.includes('?p=')){
    code = code.split('?p=')[1].split('&')[0];
  }
  code = decodeURIComponent(code).trim();
  showProductDetailByCode(code);
}

function openManualLookup(){
  openQrScanner();
  setTimeout(() => {
    const input = document.getElementById('manualProductCode');
    if(input){
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 300);
}

function lookupManualCode(){
  const input = document.getElementById('manualProductCode');
  const code = (input?.value || '').trim();
  if(!code){
    toast('Vui lòng nhập mã sản phẩm (VD: BM-2026-001 hoặc 1)', 'warn');
    input?.focus();
    return;
  }
  closeQrScanner();
  showProductDetailByCode(code);
}

/* ============ HIỂN THỊ CHI TIẾT SẢN PHẨM & TRẠNG THÁI QR ============ */
function findProductByCodeOrId(identifier){
  const clean = String(identifier || '').trim();
  if(!clean) return null;
  const cleanNorm = removeVietnameseTones(clean);

  // 1. Tìm chính xác theo productCode
  let found = products.find(p => String(p.productCode || '').trim().toLowerCase() === clean.toLowerCase());
  if(found) return found;

  // 2. Tìm theo id số
  found = products.find(p => String(p.id) === clean);
  if(found) return found;

  // 3. Tìm theo batchCode
  found = products.find(p => String(p.batchCode || '').trim().toLowerCase() === clean.toLowerCase());
  if(found) return found;

  // 4. Tìm tương đối qua qrCode URL hoặc tên
  found = products.find(p => {
    const pCodeNorm = removeVietnameseTones(p.productCode || '');
    const pBatchNorm = removeVietnameseTones(p.batchCode || '');
    return pCodeNorm.includes(cleanNorm) || pBatchNorm.includes(cleanNorm);
  });
  return found || null;
}

function showProductDetail(id){
  const p = products.find(x => x.id === Number(id));
  if(!p){
    showProductDetailNotFound(id);
    return;
  }
  renderProductDetailModal(p);
}

function showProductDetailByCode(code){
  const p = findProductByCodeOrId(code);
  if(!p){
    showProductDetailNotFound(code);
    return;
  }
  renderProductDetailModal(p);
}

function showProductDetailNotFound(searchKey){
  const overlay = document.getElementById('productDetailOverlay');
  const content = document.getElementById('productDetailContent');
  if(!overlay || !content) return;

  content.innerHTML = `
    <div class="detail-status-banner status-notfound">
      <div class="detail-status-icon"><svg class="icon icon-24" style="color:var(--danger);"><use href="#icon-x-circle"/></svg></div>
      <div>
        <div style="font-size:16px;">KHÔNG TÌM THẤY SẢN PHẨM</div>
        <div style="font-size:12.5px;font-weight:400;margin-top:2px;">Mã tra cứu: "${esc(searchKey)}"</div>
      </div>
    </div>
    <div class="product-detail-card" style="text-align:center;padding:24px 18px;">
      <p style="font-size:14px;color:var(--ink);line-height:1.6;margin:0 0 16px;">
        Hệ thống Nông nghiệp Bình Mỹ không tìm thấy thông tin sản phẩm khớp với mã bạn vừa quét hoặc nhập.
      </p>
      <div style="background:#FFF9F5;border:1px solid #FFE3D1;border-radius:12px;padding:12px 14px;font-size:13px;color:#B44300;text-align:left;line-height:1.5;margin-bottom:18px;">
        <strong>Gợi ý cho bạn:</strong><br>
        • Kiểm tra xem bạn có gõ nhầm chữ/số nào không.<br>
        • Thử quét lại mã QR trên bao bì dưới ánh sáng rõ hơn.<br>
        • Hoặc xem danh sách sản phẩm đang bán của xã Bình Mỹ.
      </div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" onclick="closeProductDetail();openQrScanner();">
          <svg class="icon"><use href="#icon-qr-scan"/></svg>Quét mã khác
        </button>
        <button type="button" class="btn" onclick="closeProductDetail();openManualLookup();">
          <svg class="icon"><use href="#icon-search"/></svg>Nhập lại mã
        </button>
        <button type="button" class="btn" onclick="closeProductDetail();switchToDauRaProducts();">
          Xem danh sách sản phẩm
        </button>
      </div>
    </div>
  `;
  overlay.classList.add('show');
}

function openProductLightbox(imgUrl, altText){
  if(!imgUrl) return;
  const overlay = document.getElementById('imageLightboxOverlay');
  const img = document.getElementById('lightboxImage');
  if(!overlay || !img) return;
  img.src = imgUrl;
  img.alt = altText || 'Ảnh sản phẩm';
  overlay.classList.add('show');
}

function closeImageLightbox(e){
  if(e && e.target && e.target.id === 'lightboxImage') return;
  const overlay = document.getElementById('imageLightboxOverlay');
  if(overlay) overlay.classList.remove('show');
}

function switchDetailImage(thumbEl, imgUrl){
  const mainImg = document.getElementById('detailMainImg');
  if(mainImg){
    mainImg.src = imgUrl;
  }
  document.querySelectorAll('.product-detail-thumb-item').forEach(el => el.classList.remove('active'));
  if(thumbEl) thumbEl.classList.add('active');
}

function renderProductDetailModal(p){
  const overlay = document.getElementById('productDetailOverlay');
  const content = document.getElementById('productDetailContent');
  if(!overlay || !content) return;

  const tests = getProductQualityTests(p);
  const isTested = tests.length > 0 || (p.certification && p.certification !== 'Chưa kiểm định' && p.certification !== 'Chưa có chứng nhận');
  const isAvailable = p.status === 'available';
  const img = getProductImage(p);
  const allImgs = getProductImages(p);

  // Status banner
  let statusBannerHtml = '';
  if(!isAvailable){
    statusBannerHtml = `
      <div class="detail-status-banner status-soldout">
        <div class="detail-status-icon"><svg class="icon icon-24"><use href="#icon-info"/></svg></div>
        <div>
          <div>SẢN PHẨM ĐÃ HẾT HÀNG</div>
          <div style="font-size:12.5px;font-weight:400;">Mặt hàng này hiện đã bán hết hoặc tạm ngưng cung cấp.</div>
        </div>
      </div>`;
  }else if(isTested){
    statusBannerHtml = `
      <div class="detail-status-banner status-valid">
        <div class="detail-status-icon"><svg class="icon icon-24" style="color:#18682C;"><use href="#icon-check-circle"/></svg></div>
        <div>
          <div>SẢN PHẨM HỢP LỆ & ĐÃ KIỂM ĐỊNH</div>
          <div style="font-size:12.5px;font-weight:400;">Nguồn gốc xuất xứ rõ ràng · Đạt tiêu chuẩn an toàn thực phẩm.</div>
        </div>
      </div>`;
  }else{
    statusBannerHtml = `
      <div class="detail-status-banner status-untested">
        <div class="detail-status-icon"><svg class="icon icon-24" style="color:#995B00;"><use href="#icon-alert-triangle"/></svg></div>
        <div>
          <div>CHƯA CÓ THÔNG TIN KIỂM ĐỊNH</div>
          <div style="font-size:12.5px;font-weight:400;">Sản phẩm đang bán của hộ dân nhưng chưa hoàn tất xét nghiệm kiểm định.</div>
        </div>
      </div>`;
  }

  // Quality & Testing table
  let qualityTableHtml = '';
  if(tests.length > 0){
    qualityTableHtml = `
      <div class="detail-quality-box">
        <div class="detail-quality-title">
          <span><svg class="icon icon-16" style="margin-right:6px;"><use href="#icon-quality"/></svg>Kết quả kiểm nghiệm an toàn thực phẩm (${tests.length} chỉ tiêu)</span>
          <span class="chip chip-pass">ĐẠT CHUẨN</span>
        </div>
        <div class="table-wrap">
          <table class="quality-test-table">
            <thead>
              <tr>
                <th>Chỉ tiêu xét nghiệm</th>
                <th>Kết quả đo</th>
                <th>Ngưỡng tối đa</th>
                <th>Đánh giá</th>
                <th>Ngày kiểm</th>
              </tr>
            </thead>
            <tbody>
              ${tests.map(t => `
                <tr>
                  <td><strong>${esc(t.metric)}</strong><br><small style="color:var(--ink-faint);">${esc(t.standard || '')}</small></td>
                  <td>${esc(t.value)} ${esc(t.unit || '')}</td>
                  <td>≤ ${esc(t.threshold)} ${esc(t.unit || '')}</td>
                  <td>${t.result === 'pass' ? '<span class="chip chip-pass">Đạt</span>' : (t.result === 'fail' ? '<span class="chip chip-fail">Không đạt</span>' : '<span class="chip chip-pending">Chờ KQ</span>')}</td>
                  <td>${esc(t.date || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }else if(p.certification && p.certification !== 'Chưa kiểm định' && p.certification !== 'Chưa có chứng nhận'){
    qualityTableHtml = `
      <div class="detail-quality-box">
        <div class="detail-quality-title">
          <span><svg class="icon icon-16" style="margin-right:6px;"><use href="#icon-quality"/></svg>Chứng nhận chất lượng: ${esc(p.certification)}</span>
          <span class="chip chip-pass">ĐÃ CHỨNG NHẬN</span>
        </div>
        <p style="font-size:13px;color:var(--ink-soft);margin:6px 0 0;">
          Lô hàng được cấp chứng nhận <strong>${esc(p.certification)}</strong>, tuân thủ đúng quy trình cách ly thuốc BVTV và canh tác an toàn.
        </p>
      </div>`;
  }else{
    qualityTableHtml = `
      <div class="detail-quality-box" style="background:#FAF8F5;">
        <div class="detail-quality-title" style="color:#A06000;">
          <span><svg class="icon icon-16" style="margin-right:6px;"><use href="#icon-alert-triangle"/></svg>Chưa có thông tin kiểm định</span>
        </div>
        <p style="font-size:13px;color:var(--ink-soft);margin:4px 0 0;">
          Lô sản phẩm này chưa gửi mẫu xét nghiệm dư lượng nitrat / kim loại nặng. Khách mua có thể liên hệ trực tiếp chủ hộ để hỏi thêm về quy trình chăm bón.
        </p>
      </div>`;
  }

  // Thumbnails if multiple images
  let thumbsHtml = '';
  if(allImgs.length > 1){
    thumbsHtml = `
      <div class="product-detail-thumbs">
        ${allImgs.map((im, i) => `
          <img
            src="${esc(im)}"
            alt="Ảnh thu nhỏ ${i+1}"
            class="product-detail-thumb-item ${i === 0 ? 'active' : ''}"
            onclick="switchDetailImage(this, '${esc(im)}')"
            loading="lazy">
        `).join('')}
      </div>`;
  }

  content.innerHTML = `
    ${statusBannerHtml}

    <div class="product-detail-header-grid">
      <!-- Media Column -->
      <div class="product-detail-media-wrap">
        <div class="product-detail-main-img-box" onclick="${img ? `openProductLightbox('${esc(img)}', '${esc(p.name)}')` : ''}" title="${img ? 'Bấm xem ảnh lớn' : ''}">
          ${img ? `
            <img id="detailMainImg" src="${esc(img)}" alt="${esc(p.name)}" class="product-detail-main-img" loading="lazy" decoding="async">
            <div class="detail-img-zoom-hint">
              <svg class="icon icon-12"><use href="#icon-eye"/></svg> Phóng to ảnh
            </div>
          ` : `
            <div class="product-image-placeholder" style="aspect-ratio:4/3;border-radius:14px;">
              <span style="font-size:48px;">🌱</span>
              <small style="font-size:13px;">Chưa có ảnh sản phẩm</small>
            </div>
          `}
        </div>
        ${thumbsHtml}
      </div>

      <!-- Hero Info Column -->
      <div class="product-detail-info-col">
        <h2 class="detail-title-hero">${esc(p.name)}</h2>
        
        <div class="detail-price-hero">
          ${money(p.price)} đ <span class="detail-price-unit">/ ${esc(p.unitLabel || 'kg')}</span>
        </div>

        <div class="detail-badge-list">
          ${isAvailable ? '<span class="dt-badge dt-badge-available">✓ Đang còn hàng</span>' : '<span class="dt-badge dt-badge-soldout">Hết hàng</span>'}
          ${p.certification && p.certification !== 'Chưa kiểm định' && p.certification !== 'Chưa có chứng nhận' ? `<span class="dt-badge dt-badge-vietgap">${esc(p.certification)}</span>` : ''}
          ${isTested ? '<span class="dt-badge dt-badge-tested">✓ Đã kiểm định</span>' : '<span class="dt-badge dt-badge-untested">Chưa kiểm định</span>'}
          ${p.productCode || p.qrCode ? '<span class="dt-badge dt-badge-qr-yes"><svg class="icon icon-12"><use href="#icon-qr-code"/></svg> Có truy xuất nguồn gốc</span>' : ''}
        </div>

        <div class="detail-quick-meta">
          <div class="detail-meta-line">
            <span>📦 Số lượng sẵn có:</span>
            <strong>${isAvailable ? `${esc(p.quantity)} ${esc(p.unitLabel || 'kg')}` : 'Đã bán hết'}</strong>
          </div>
          <div class="detail-meta-line">
            <span>📍 Khu vực trồng:</span>
            <strong>${esc(p.ap || 'Xã Bình Mỹ, Củ Chi')}</strong>
          </div>
          <div class="detail-meta-line">
            <span>👨‍🌾 Người bán / Chủ hộ:</span>
            <strong>${esc(p.sellerName || 'Hộ trồng Bình Mỹ')}</strong>
          </div>
          <div class="detail-meta-line">
            <span>📞 Điện thoại liên hệ:</span>
            <strong><a href="tel:${esc(p.contactPhone)}" style="color:var(--river-deep);text-decoration:underline;">${esc(p.contactPhone) || 'Chưa cập nhật'}</a></strong>
          </div>
        </div>

        <div class="detail-hero-actions">
          <button type="button" class="btn btn-primary btn-detail-buy" onclick="closeProductDetail();openBuyForm(${p.id});" ${!isAvailable ? 'disabled' : ''}>
            <svg class="icon icon-18"><use href="#icon-phone"/></svg> 🛒 Liên hệ mua ngay
          </button>
          <button type="button" class="btn btn-detail-qr" onclick="closeProductDetail();openProductQrModal(${p.id});">
            <svg class="icon icon-16"><use href="#icon-qr-code"/></svg> In tem QR
          </button>
        </div>
      </div>
    </div>

    <!-- Thông tin chi tiết kỹ thuật -->
    <div class="product-detail-card" style="margin-top:0;">
      <div style="font-weight:700;font-size:15px;color:var(--ink);margin-bottom:12px;border-bottom:1px solid var(--line);padding-bottom:6px;">
        Thông tin chi tiết sản phẩm
      </div>
      <div class="detail-grid">
        <div class="detail-grid-item">
          <span class="detail-lbl">Mã sản phẩm</span>
          <span class="detail-val" style="color:var(--paddy-deep);font-weight:700;">${esc(p.productCode || 'BM-SP-' + p.id)}</span>
        </div>
        <div class="detail-grid-item">
          <span class="detail-lbl">Số lô / Lô thu hoạch</span>
          <span class="detail-val">${esc(p.batchCode || 'LÔ-01')}</span>
        </div>
        <div class="detail-grid-item">
          <span class="detail-lbl">Ngày thu hoạch / Ngày hái</span>
          <span class="detail-val">${esc(p.harvestDate || p.postedDate || 'Trong ngày')}</span>
        </div>
        <div class="detail-grid-item">
          <span class="detail-lbl">Người phụ trách liên hệ</span>
          <span class="detail-val">${esc(p.contactName || p.sellerName || 'Chủ hộ')}</span>
        </div>
      </div>
      ${p.note ? `<div style="margin-top:12px;padding:10px 12px;background:#FAFBF9;border:1px dashed var(--line);border-radius:8px;font-size:13px;color:var(--ink-soft);"><strong>📝 Ghi chú:</strong> ${esc(p.note)}</div>` : ''}
    </div>

    <!-- Lịch sử vòng đời nông sản -->
    <div class="product-timeline-box" style="margin-top:16px;">
      <div class="product-timeline-title">Lịch sử vòng đời nông sản</div>
      <div class="timeline-steps">
        <div class="timeline-step done">
          <div class="timeline-dot"><svg class="icon icon-16"><use href="#icon-sprout"/></svg></div>
          <div class="timeline-label">Tạo sản phẩm</div>
        </div>
        <div class="timeline-step done">
          <div class="timeline-dot"><svg class="icon icon-16"><use href="#icon-sprout"/></svg></div>
          <div class="timeline-label">Canh tác sạch</div>
        </div>
        <div class="timeline-step ${isTested ? 'done' : 'active'}">
          <div class="timeline-dot"><svg class="icon icon-16"><use href="#icon-quality"/></svg></div>
          <div class="timeline-label">${isTested ? 'Đã kiểm định' : 'Kiểm định'}</div>
        </div>
        <div class="timeline-step done">
          <div class="timeline-dot"><svg class="icon icon-16"><use href="#icon-package"/></svg></div>
          <div class="timeline-label">Thu hoạch</div>
        </div>
        <div class="timeline-step ${isAvailable ? 'active' : 'done'}">
          <div class="timeline-dot"><svg class="icon icon-16"><use href="#icon-products"/></svg></div>
          <div class="timeline-label">${isAvailable ? 'Đang bán' : 'Đã bán hết'}</div>
        </div>
      </div>
    </div>

    <!-- Chi tiết kiểm định -->
    ${qualityTableHtml}

    <div class="modal-actions" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn btn-primary" onclick="closeProductDetail();openBuyForm(${p.id});" ${!isAvailable ? 'disabled' : ''}>
          <svg class="icon icon-16"><use href="#icon-phone"/></svg> Liên hệ mua
        </button>
        <button type="button" class="btn" onclick="closeProductDetail();openProductQrModal(${p.id});">
          <svg class="icon"><use href="#icon-qr-code"/></svg> In tem QR
        </button>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn" onclick="closeProductDetail();openQrScanner();">
          <svg class="icon"><use href="#icon-qr-scan"/></svg> Quét mã khác
        </button>
        <button type="button" class="btn" onclick="closeProductDetail();">Đóng lại</button>
      </div>
    </div>

    <!-- Mobile Sticky Action Bar -->
    <div class="mobile-detail-sticky-bar">
      <div class="sticky-bar-price">
        ${money(p.price)} đ<small>/${esc(p.unitLabel || 'kg')}</small>
      </div>
      <button type="button" class="btn btn-primary btn-sticky-buy" onclick="closeProductDetail();openBuyForm(${p.id});" ${!isAvailable ? 'disabled' : ''}>
        <svg class="icon icon-16"><use href="#icon-phone"/></svg> Liên hệ mua
      </button>
    </div>
  `;
  overlay.classList.add('show');
}

function closeProductDetail(){
  const overlay = document.getElementById('productDetailOverlay');
  if(overlay) overlay.classList.remove('show');
}

/* ============ TẠO, XEM, IN VÀ TẢI MÃ QR SẢN PHẨM ============ */
let currentQrProduct = null;

function openProductQrModal(id){
  const p = products.find(x => x.id === Number(id));
  if(!p) return;
  currentQrProduct = p;

  if(!p.productCode){
    p.productCode = 'BM-' + new Date().getFullYear() + '-' + String(p.id).padStart(3, '0');
  }
  p.qrCode = `${window.location.origin}${window.location.pathname}#san-pham=${encodeURIComponent(p.productCode)}`;

  const overlay = document.getElementById('productQrOverlay');
  if(!overlay) return;

  document.getElementById('qrStampProductName').textContent = p.name;
  document.getElementById('qrStampCode').textContent = p.productCode;
  document.getElementById('qrStampSeller').textContent = p.sellerName || 'Hộ trồng Bình Mỹ';
  document.getElementById('qrStampAp').textContent = p.ap || 'Xã Bình Mỹ';
  
  const certRow = document.getElementById('qrStampCertRow');
  const certSpan = document.getElementById('qrStampCert');
  if(p.certification && p.certification !== 'Chưa kiểm định'){
    certSpan.textContent = p.certification;
    certRow.style.display = 'block';
  }else{
    certRow.style.display = 'none';
  }

  const canvasWrap = document.getElementById('productQrCanvas');
  canvasWrap.innerHTML = '';

  const qrUrl = p.qrCode;

  // Sử dụng thư viện QRCode nếu có sẵn
  if(typeof QRCode !== 'undefined'){
    try{
      new QRCode(canvasWrap, {
        text: qrUrl,
        width: 170,
        height: 170,
        colorDark: "#11421A",
        colorLight: "#FFFFFF",
        correctLevel: QRCode.CorrectLevel.H
      });
    }catch(e){
      console.warn("Lỗi render QRCode:", e);
      renderFallbackQrImg(canvasWrap, qrUrl);
    }
  }else{
    renderFallbackQrImg(canvasWrap, qrUrl);
  }

  overlay.classList.add('show');
}

function renderFallbackQrImg(wrap, text){
  const imgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}`;
  wrap.innerHTML = `<img src="${imgUrl}" alt="Mã QR nông sản Bình Mỹ" style="max-width:180px;height:auto;display:block;margin:0 auto;">`;
}

function closeProductQrModal(){
  const overlay = document.getElementById('productQrOverlay');
  if(overlay) overlay.classList.remove('show');
  currentQrProduct = null;
}

function downloadProductQr(){
  if(!currentQrProduct) return;
  const canvasWrap = document.getElementById('productQrCanvas');
  const canvas = canvasWrap?.querySelector('canvas');
  const img = canvasWrap?.querySelector('img');

  let dataUrl = '';
  if(canvas){
    dataUrl = canvas.toDataURL('image/png');
  }else if(img && img.src.startsWith('data:')){
    dataUrl = img.src;
  }else if(img){
    dataUrl = img.src;
  }

  if(dataUrl){
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `QR_${currentQrProduct.productCode || currentQrProduct.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('✅ Đã tải ảnh mã QR về máy thành công', 'ok');
  }else{
    toast('Đang tạo ảnh QR, bạn vui lòng thử lại sau 1 giây', 'warn');
  }
}

function printProductQr(){
  window.print();
}

/* ============ HƯỚNG DẪN DỄ DÙNG & ĐIỀU HƯỚNG NHANH ============ */
function openHelpModal(){
  const overlay = document.getElementById('helpModalOverlay');
  if(overlay) overlay.classList.add('show');
}

function closeHelpModal(){
  const overlay = document.getElementById('helpModalOverlay');
  if(overlay) overlay.classList.remove('show');
}

function switchToDauRaProducts(){
  showView('tin-thu-mua');
  const tabBtn = document.querySelector('#dauRaTabs2 button[data-subtab="dr2-products"]');
  if(tabBtn) tabBtn.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchToDauRaDemand(){
  showView('tin-thu-mua');
  const tabBtn = document.querySelector('#dauRaTabs2 button[data-subtab="dr2-demand"]');
  if(tabBtn) tabBtn.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchToQuality(){
  showView('kiem-dinh');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchToAI(){
  showView('tro-ly-ai');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Kiểm tra liên kết sâu URL để tự động mở sản phẩm khi người dùng quét QR từ ứng dụng ngoài
function checkDeepLinkProduct(){
  const hash = location.hash || '';
  if(hash.startsWith('#san-pham=')){
    const code = decodeURIComponent(hash.slice(10)).trim();
    if(code){
      showProductDetailByCode(code);
      return;
    }
  }
  const params = new URLSearchParams(location.search);
  const pCode = params.get('p');
  if(pCode){
    showProductDetailByCode(pCode.trim());
  }
}


function openBuyForm(id){
  const p = products.find(x => x.id === id);
  if(!p) return;
  clearFieldErrors('buyOverlay');
  document.getElementById('by_productId').value = id;
  document.getElementById('buyForTitle').textContent = 'Liên hệ mua "' + p.name + '" — Người bán: ' + (p.sellerName || '—');
  ['by_name','by_phone','by_quantity','by_note'].forEach(fid => document.getElementById(fid).value = '');
  if(currentPersonUser && currentPersonUser.role === 'buyer'){
    document.getElementById('by_name').value = currentPersonUser.displayName;
    document.getElementById('by_phone').value = currentPersonUser.phone || '';
  }
  document.getElementById('buyOverlay').classList.add('show');
}

function closeBuyForm(){
  document.getElementById('buyOverlay').classList.remove('show');
  clearFieldErrors('buyOverlay');
}

async function submitBuyRequest(){
  clearFieldErrors('buyOverlay');
  const id = Number(document.getElementById('by_productId').value);
  const name = document.getElementById('by_name').value.trim();
  const phone = document.getElementById('by_phone').value.trim();

  let hasErr = false;
  if(!name){
    setFieldError('by_name', 'err_by_name', 'Vui lòng nhập tên bạn hoặc tên đơn vị mua.');
    hasErr = true;
  }
  if(!phone || !/^[0-9+\s\-()]{8,15}$/.test(phone)){
    setFieldError('by_phone', 'err_by_phone', 'Vui lòng nhập số điện thoại hợp lệ.');
    hasErr = true;
  }
  if(hasErr) return;

  const payload = {
    productId: id,
    name,
    phone,
    quantity: document.getElementById('by_quantity').value.trim(),
    note: document.getElementById('by_note').value.trim()
  };

  setBtnLoading('btnSubmitBuy', true);
  try{
    try{
      await httpsCallable(functions, 'submitBuyRequest')(payload);
    }catch(cfErr){
      // Chế độ dự phòng khi backend Cloud Function chưa kết nối
      const targetProduct = products.find(p => p.id === id);
      if(targetProduct){
        if(!targetProduct.buyRequests) targetProduct.buyRequests = [];
        targetProduct.buyRequests.push({
          name: payload.name,
          phone: payload.phone,
          quantity: payload.quantity,
          note: payload.note,
          requestedAt: new Date().toISOString()
        });
        await saveProducts();
      }
    }
    closeBuyForm();
    renderAll();
    toast('Đã gửi yêu cầu mua, người bán sẽ liên hệ lại với bạn', 'ok');
  }catch(e){
    console.error('Lỗi gửi yêu cầu mua:', e);
    toast('Không gửi được yêu cầu: ' + (e.message || ''), 'warn');
  }finally{
    setBtnLoading('btnSubmitBuy', false);
  }
}

/* ============ Quản lý hộ trồng & Quy hoạch xã ============ */
function apOptionsHtml(selected){
  const aps = Array.from(new Set(households.map(h => h.ap))).sort();
  return aps.map(ap => `<option value="${esc(ap)}" ${ap === selected ? 'selected' : ''}>${esc(ap)}</option>`).join('');
}

function sortedHouseholds(list){
  if(!hhSortKey) return list;
  const arr = [...list];
  arr.sort((a, b) => {
    let av = a[hhSortKey], bv = b[hhSortKey];
    if(typeof av === 'string' || typeof bv === 'string'){
      av = (av == null ? '' : String(av)).toLowerCase();
      bv = (bv == null ? '' : String(bv)).toLowerCase();
      return av.localeCompare(bv) * hhSortDir;
    }
    return ((av || 0) - (bv || 0)) * hhSortDir;
  });
  return arr;
}

function renderHouseholds(){
  const filterEl = document.getElementById('filterAp');
  if(filterEl){
    const current = filterEl.value || 'all';
    filterEl.innerHTML = `<option value="all">Tất cả các ấp</option>` + apOptionsHtml(current === 'all' ? null : current);
    filterEl.value = Array.from(filterEl.options).some(o => o.value === current) ? current : 'all';
  }

  const filter = filterEl?.value || 'all';
  const q = (document.getElementById('searchHh')?.value || '').trim().toLowerCase();
  let list = filter === 'all' ? households : households.filter(h => h.ap === filter);
  if(q){
    list = list.filter(h =>
      (h.name || '').toLowerCase().includes(q) ||
      (h.crop || '').toLowerCase().includes(q) ||
      (h.note || '').toLowerCase().includes(q)
    );
  }
  list = sortedHouseholds(list);

  const body = document.getElementById('hhTableBody');
  if(!body) return;
  if(list.length === 0){
    body.innerHTML = emptyRow(8, 'Không tìm thấy hộ trồng phù hợp.');
    return;
  }
  body.innerHTML = list.map(h => `
    <tr>
      <td><strong>${esc(h.name)}</strong></td>
      <td>${esc(h.ap)}</td>
      <td>${esc(h.crop)}</td>
      <td>${esc(h.area)}</td>
      <td>${esc(h.years) || '—'}</td>
      <td>${esc(h.phone) || '—'}</td>
      <td>${esc(h.note)}</td>
      <td class="row-actions">
        ${canManage(h.ap) ? `<button class="btn btn-sm" onclick="openHhForm(${h.id})">Sửa</button>
          <button class="btn btn-sm btn-danger" onclick="deleteHousehold(${h.id})">Xóa</button>` : ''}
      </td>
    </tr>`).join('');

  document.querySelectorAll('#hhTable th.sortable').forEach(th => {
    const key = th.getAttribute('data-sort');
    th.textContent = th.textContent.replace(/ [▲▼]$/, '');
    if(key === hhSortKey){
      th.textContent += hhSortDir === 1 ? ' ▲' : ' ▼';
    }
  });
}

function renderWardSummary(){
  const aps = Array.from(new Set(households.map(h => h.ap))).sort();
  const colors = ['var(--paddy)','var(--river)','var(--papaya)','var(--bloom)'];
  const summary = aps.map(ap => {
    const hhs = households.filter(h => h.ap === ap);
    const totalArea = hhs.reduce((a, h) => a + Number(h.area || 0), 0);
    const cropCount = {};
    hhs.forEach(h => { cropCount[h.crop] = (cropCount[h.crop] || 0) + 1; });
    const mainCrop = Object.keys(cropCount).sort((a, b) => cropCount[b] - cropCount[a])[0] || '—';
    return { ap, count: hhs.length, totalArea, mainCrop };
  });

  const wardEl = document.getElementById('wardSummary');
  if(wardEl){
    wardEl.innerHTML = summary.map((s, i) => `
      <div class="stat-card" style="--accent:${colors[i % colors.length]}">
        <svg class="icon"><use href="#icon-households"/></svg>
        <div class="num-face">${s.count}</div>
        <div class="lbl">Hộ trồng — ${esc(s.ap)}</div>
        <div class="lbl" style="margin-top:6px;">${money(s.totalArea)} ha · Chủ lực: ${esc(s.mainCrop)}</div>
      </div>`).join('') || '<div class="stat-card empty"><svg class="icon"><use href="#icon-sprout"/></svg>Chưa có dữ liệu hộ trồng.</div>';
  }

  const ctx = document.getElementById('wardAreaChart');
  if(!ctx) return;
  if(typeof Chart === 'undefined'){
    ctx.replaceWith(Object.assign(document.createElement('p'), {
      className: 'empty',
      innerHTML: '<svg class="icon"><use href="#icon-sprout"/></svg>Không tải được thư viện biểu đồ.'
    }));
    return;
  }
  if(wardChart) wardChart.destroy();
  wardChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: summary.map(s => s.ap),
      datasets: [{
        label: 'Diện tích canh tác (ha)',
        data: summary.map(s => s.totalArea),
        backgroundColor: '#1C7ED6',
        borderRadius: 6,
        maxBarThickness: 60
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#E3E7DE' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function openHhForm(id){
  if(id && !canManage(households.find(x => x.id === id)?.ap)){
    toast('Bạn không có quyền sửa hộ trồng này', 'warn');
    return;
  }
  clearFieldErrors('hhOverlay');
  document.getElementById('hhOverlay').classList.add('show');
  const apInput = document.getElementById('hh_ap');
  if(id){
    const h = households.find(x => x.id === id);
    document.getElementById('hhFormTitle').textContent = 'Sửa thông tin hộ trồng';
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
    ['hh_name','hh_ap','hh_crop','hh_area','hh_years','hh_phone','hh_note'].forEach(k => document.getElementById(k).value = '');
    if(currentUser && currentUser.role === 'ward') apInput.value = currentUser.ap;
  }
  apInput.disabled = !!(currentUser && currentUser.role === 'ward');
}

function closeHhForm(){
  document.getElementById('hhOverlay').classList.remove('show');
  document.getElementById('hh_ap').disabled = false;
  clearFieldErrors('hhOverlay');
}

async function saveHhForm(){
  if(!isAdmin){
    toast('Chỉ cán bộ nông nghiệp có quyền lưu thông tin hộ trồng', 'warn');
    return;
  }
  clearFieldErrors('hhOverlay');

  const id = document.getElementById('hh_editId').value;
  const nameVal = document.getElementById('hh_name').value.trim();
  const apVal = (currentUser && currentUser.role === 'ward') ? currentUser.ap : document.getElementById('hh_ap').value.trim();
  const cropVal = document.getElementById('hh_crop').value.trim();
  const areaVal = document.getElementById('hh_area').value.trim();

  let hasErr = false;
  if(!nameVal){
    setFieldError('hh_name', 'err_hh_name', 'Vui lòng nhập tên chủ hộ.');
    hasErr = true;
  }
  if(!apVal){
    setFieldError('hh_ap', 'err_hh_ap', 'Vui lòng chọn hoặc nhập ấp.');
    hasErr = true;
  }
  if(!cropVal){
    setFieldError('hh_crop', 'err_hh_crop', 'Vui lòng nhập cây trồng chính.');
    hasErr = true;
  }
  if(!areaVal || Number(areaVal) <= 0){
    setFieldError('hh_area', 'err_hh_area', 'Diện tích canh tác phải lớn hơn 0.');
    hasErr = true;
  }
  if(hasErr) return;

  const record = {
    name: nameVal,
    ap: apVal,
    crop: cropVal,
    area: Number(areaVal),
    years: Number(document.getElementById('hh_years').value || 0),
    phone: document.getElementById('hh_phone').value.trim(),
    note: document.getElementById('hh_note').value.trim()
  };

  setBtnLoading('btnSaveHh', true);
  try{
    if(id){
      if(!canManage(households.find(x => x.id === Number(id))?.ap)){
        toast('Bạn không có quyền sửa hộ trồng này', 'warn');
        return;
      }
      const idx = households.findIndex(x => x.id === Number(id));
      households[idx] = { ...households[idx], ...record };
    }else{
      const newId = households.length ? Math.max(...households.map(h => h.id)) + 1 : 1;
      households.push({ id: newId, ...record });
    }
    await saveHouseholds();
    await logActivity((id ? 'Cập nhật hộ trồng: ' : 'Thêm hộ trồng mới: ') + record.name + ' — bởi ' + currentUser.user);
    closeHhForm();
    renderAll();
    toast('Đã lưu thông tin hộ trồng', 'ok');
  }catch(e){
    console.error(e);
    toast('Lỗi khi lưu hộ trồng: ' + e.message, 'warn');
  }finally{
    setBtnLoading('btnSaveHh', false);
  }
}

async function deleteHousehold(id){
  const h = households.find(x => x.id === id);
  if(!canManage(h?.ap)){
    toast('Bạn không có quyền xóa hộ trồng này', 'warn');
    return;
  }
  const ok = await showConfirmDialog(
    'Xóa hộ trồng',
    `Xóa hộ trồng "${h?.name}" (${h?.ap})? Các mùa vụ liên quan sẽ chuyển về trạng thái "Chưa gán hộ trồng".`,
    'Xóa hộ trồng',
    true
  );
  if(!ok) return;

  households = households.filter(x => x.id !== id);
  seasons.forEach(s => {
    if(s.householdId === id) s.householdId = null;
  });
  await saveHouseholds();
  await saveSeasons();
  await logActivity('Xóa hộ trồng: ' + (h ? h.name : '') + ' — bởi ' + currentUser.user);
  renderAll();
  toast('Đã xóa hộ trồng', 'warn');
}

/* ============ Đăng nhập / Đăng xuất ============ */
function logout(){
  signOut(auth);
  currentUser = null;
  isAdmin = false;
  isSuperAdmin = false;
  currentPersonUser = null;
  if(location.hash.slice(1) === 'quan-ly'){
    location.hash = 'tin-thu-mua';
  }
  renderAll();
  toast('Đã đăng xuất', 'ok');
}

function personLogout(){ logout(); }

function openPersonAuth(mode){
  document.getElementById('personLoginError').style.display = 'none';
  document.getElementById('personRegisterError').style.display = 'none';
  document.getElementById('pu_loginUser').value = '';
  document.getElementById('pu_loginPass').value = '';
  ['pu_displayName','pu_regUser','pu_regPass','pu_phone','pu_ap'].forEach(k => document.getElementById(k).value = '');
  document.getElementById('pu_role').value = 'grower';
  togglePuApField();
  switchPersonAuth(mode || 'login');
  document.getElementById('personAuthOverlay').classList.add('show');
}

function closePersonAuth(){
  document.getElementById('personAuthOverlay').classList.remove('show');
}

function switchPersonAuth(mode){
  const isLogin = mode === 'login';
  document.getElementById('personAuthTitle').textContent = isLogin ? 'Đăng nhập hệ thống' : 'Đăng ký tài khoản';
  document.getElementById('personLoginView').style.display = isLogin ? 'block' : 'none';
  document.getElementById('personRegisterView').style.display = isLogin ? 'none' : 'block';
}

function togglePuApField(){
  const apField = document.getElementById('pu_ap_field');
  if(apField){
    apField.style.display = document.getElementById('pu_role').value === 'grower' ? 'block' : 'none';
  }
}

async function doPersonLogin(){
  const u = document.getElementById('pu_loginUser').value.trim();
  const p = document.getElementById('pu_loginPass').value;
  const errEl = document.getElementById('personLoginError');

  if(!isEmail(u)){
    errEl.textContent = 'Vui lòng nhập định dạng email hợp lệ.';
    errEl.style.display = 'block';
    return;
  }

  setBtnLoading('btnDoLogin', true, 'Đăng nhập');
  try{
    const cred = await signInWithEmailAndPassword(auth, personEmail(u), p);
    // Nhận diện vai trò: Admin xã / Cán bộ ấp hay Hộ trồng / Quán ăn
    const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid));
    if(adminSnap.exists()){
      currentUser = { uid: cred.user.uid, ...adminSnap.data() };
      isAdmin = true;
      isSuperAdmin = currentUser.role === 'super';
      closePersonAuth();
      renderAll();
      toast('Đăng nhập thành công · ' + roleLabel(currentUser.role), 'ok');
      return;
    }
    const personSnap = await getDoc(doc(db, 'personUsers', cred.user.uid));
    if(!personSnap.exists()){
      await signOut(auth);
      errEl.textContent = 'Tài khoản chưa được kích hoạt trong hệ thống nông nghiệp.';
      errEl.style.display = 'block';
      return;
    }
    currentPersonUser = { uid: cred.user.uid, ...personSnap.data() };
    closePersonAuth();
    renderAll();
    toast('Đăng nhập thành công · ' + personRoleLabel(currentPersonUser.role), 'ok');
  }catch(e){
    console.error('Lỗi đăng nhập:', e.code, e.message);
    errEl.textContent = 'Email hoặc mật khẩu không chính xác.';
    errEl.style.display = 'block';
  }finally{
    setBtnLoading('btnDoLogin', false, 'Đăng nhập');
  }
}

async function doPersonRegister(){
  const role = document.getElementById('pu_role').value;
  const displayName = document.getElementById('pu_displayName').value.trim();
  const username = document.getElementById('pu_regUser').value.trim();
  const password = document.getElementById('pu_regPass').value;
  const phone = document.getElementById('pu_phone').value.trim();
  const ap = role === 'grower' ? document.getElementById('pu_ap').value.trim() : '';
  const err = document.getElementById('personRegisterError');
  const email = personEmail(username);

  if(!displayName || !username || !password || !phone || (role === 'grower' && !ap) || !isEmail(email)){
    err.textContent = !isEmail(email) ? 'Vui lòng nhập định dạng email hợp lệ.' : 'Vui lòng điền đầy đủ các thông tin bắt buộc.';
    err.style.display = 'block';
    return;
  }
  if(password.length < 8){
    err.textContent = 'Mật khẩu phải có ít nhất 8 ký tự.';
    err.style.display = 'block';
    return;
  }

  setBtnLoading('btnDoRegister', true, 'Tạo tài khoản');
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const record = {
      username,
      email,
      role,
      displayName,
      phone,
      ap,
      createdDate: new Date().toISOString().slice(0, 10)
    };
    await setDoc(doc(db, 'personUsers', cred.user.uid), record);
    currentPersonUser = { uid: cred.user.uid, ...record };
    closePersonAuth();
    renderAll();
    toast('Đăng ký tài khoản thành công', 'ok');
  }catch(e){
    err.textContent = e.code === 'auth/email-already-in-use' ? 'Email này đã được đăng ký tài khoản.' : ('Lỗi: ' + e.message);
    err.style.display = 'block';
  }finally{
    setBtnLoading('btnDoRegister', false, 'Tạo tài khoản');
  }
}

function openResetOverlay(){
  const overlay = document.getElementById('resetOverlay');
  const emailInput = document.getElementById('reset_email');
  const errEl = document.getElementById('resetError');
  if(!overlay || !emailInput || !errEl) return;
  errEl.style.display = 'none';
  emailInput.value = '';
  overlay.classList.add('show');
}

function closeResetOverlay(){
  const overlay = document.getElementById('resetOverlay');
  if(overlay) overlay.classList.remove('show');
}

async function sendPasswordResetRequest(){
  const emailInput = document.getElementById('reset_email');
  const errEl = document.getElementById('resetError');
  const email = personEmail(emailInput.value);
  errEl.style.display = 'none';
  if(!isEmail(email)){
    errEl.textContent = 'Vui lòng nhập địa chỉ email hợp lệ.';
    errEl.style.display = 'block';
    return;
  }
  try{
    await sendPasswordResetEmail(auth, email);
    closeResetOverlay();
    toast('Đã gửi email khôi phục mật khẩu. Vui lòng kiểm tra hộp thư!', 'ok');
  }catch(e){
    console.error('Lỗi gửi email reset:', e);
    errEl.textContent = 'Lỗi gửi yêu cầu: ' + e.message;
    errEl.style.display = 'block';
  }
}

function openPwForm(){
  document.getElementById('pwError').style.display = 'none';
  const label = currentUser ? currentUser.user : (currentPersonUser ? (currentPersonUser.email || currentPersonUser.username) : '');
  document.getElementById('pw_user').value = label;
  document.getElementById('pw_pass').value = '';
  document.getElementById('pw_pass2').value = '';
  document.getElementById('pwOverlay').classList.add('show');
}

function closePwForm(){
  document.getElementById('pwOverlay').classList.remove('show');
}

async function savePwForm(){
  const p1 = document.getElementById('pw_pass').value;
  const p2 = document.getElementById('pw_pass2').value;
  const errEl = document.getElementById('pwError');

  if(!p1 || p1.length < 8){
    errEl.textContent = 'Mật khẩu mới phải có tối thiểu 8 ký tự.';
    errEl.style.display = 'block';
    return;
  }
  if(p1 !== p2){
    errEl.textContent = 'Mật khẩu xác nhận không khớp.';
    errEl.style.display = 'block';
    return;
  }

  try{
    await updatePassword(auth.currentUser, p1);
    closePwForm();
    toast('Đã cập nhật mật khẩu thành công', 'ok');
  }catch(e){
    errEl.textContent = e.code === 'auth/requires-recent-login'
      ? 'Vì lý do bảo mật, vui lòng đăng xuất và đăng nhập lại trước khi đổi mật khẩu.'
      : ('Không thể đổi mật khẩu: ' + e.message);
    errEl.style.display = 'block';
  }
}

/* ============ Quản lý tài khoản cán bộ (Chỉ SuperAdmin) ============ */
function openAccountsModal(){
  if(!isSuperAdmin){
    toast('Chỉ Quản trị viên xã có quyền quản lý tài khoản', 'warn');
    return;
  }
  renderAccountsTable();
  document.getElementById('accountsOverlay').classList.add('show');
}

function closeAccountsModal(){
  document.getElementById('accountsOverlay').classList.remove('show');
}

/* ============ Nhập dữ liệu test từ JSON (Chỉ SuperAdmin) ============ */
let testDataImport = null;

const IMPORT_LABELS = {
  seasons: 'Mùa vụ',
  households: 'Hộ trồng',
  qualityTests: 'Kiểm định',
  outputs: 'Đầu ra',
  procurements: 'Thu mua',
  products: 'Sản phẩm',
  activity: 'Hoạt động'
};

function openTestDataImportModal(){
  if(!isSuperAdmin){
    toast('Chỉ Quản trị viên xã mới có quyền nhập dữ liệu test', 'warn');
    return;
  }
  resetTestDataImport();
  document.getElementById('testDataImportOverlay').classList.add('show');
}

function closeTestDataImportModal(){
  document.getElementById('testDataImportOverlay').classList.remove('show');
  resetTestDataImport();
}

function resetTestDataImport(){
  testDataImport = null;
  const input = document.getElementById('testDataImportFile');
  const preview = document.getElementById('testDataImportPreview');
  const status = document.getElementById('testDataImportStatus');
  const fileName = document.getElementById('testDataImportFileName');
  if(input) input.value = '';
  if(preview) preview.hidden = true;
  if(status) status.innerHTML = '';
  if(fileName){ fileName.hidden = true; fileName.textContent = ''; }
  document.querySelector('input[name="testDataImportMode"][value="replace"]')?.click();
}

function renderTestDataImportPreview(fileName, prepared){
  const preview = document.getElementById('testDataImportPreview');
  const fileNameEl = document.getElementById('testDataImportFileName');
  const summary = document.getElementById('testDataImportSummary');
  const notice = document.getElementById('testDataImportNotice');
  if(!preview || !fileNameEl || !summary || !notice) return;

  fileNameEl.textContent = '✓ ' + fileName;
  summary.innerHTML = IMPORTABLE_KEYS.map(key =>
    `<div><span>${IMPORT_LABELS[key]}</span><strong>${prepared.counts[key]}</strong></div>`
  ).join('');
  notice.textContent = prepared.unsupported.length
    ? `Đã bỏ qua ${prepared.unsupported.length} trường dữ liệu không được hỗ trợ.`
    : '';
  preview.hidden = false;
}

function renderTestDataImportStatus(items){
  const status = document.getElementById('testDataImportStatus');
  if(!status) return;
  status.innerHTML = items.map(item =>
    `<div class="test-import-status-${item.ok ? 'ok' : 'error'}">${item.ok ? '✓' : '✕'} ${IMPORT_LABELS[item.key] || item.key}${item.reason ? ': ' + esc(item.reason) : ''}</div>`
  ).join('');
}

async function readTestDataImportFile(input){
  if(!isSuperAdmin){
    toast('Chỉ Quản trị viên xã mới có quyền nhập dữ liệu test', 'warn');
    return;
  }
  const file = input.files?.[0];
  if(!file) return;
  const fileName = document.getElementById('testDataImportFileName');
  if(fileName){ fileName.textContent = '✓ ' + file.name; fileName.hidden = false; }

  try{
    const parsed = JSON.parse(await file.text());
    const prepared = prepareTestDataImport(parsed, normalizeProduct);
    testDataImport = { fileName: file.name, ...prepared };
    renderTestDataImportPreview(file.name, prepared);
    renderTestDataImportStatus(prepared.invalid.map(item => ({ ...item, ok: false })));
  }catch(e){
    testDataImport = null;
    document.getElementById('testDataImportPreview').hidden = true;
    const message = e instanceof SyntaxError
      ? 'File JSON không hợp lệ. Vui lòng kiểm tra cú pháp JSON.'
      : (e.message === 'File phải chứa một object dữ liệu.'
        ? 'Cấu trúc JSON không hợp lệ. File phải chứa một object dữ liệu.'
        : 'Không thể đọc file JSON.');
    renderTestDataImportStatus([{ key: 'JSON', ok: false, reason: message }]);
  }
}

function testDataImportTarget(key, imported, mode){
  const current = {
    seasons, households, qualityTests, outputs, procurements, products, activity
  }[key] || [];
  return buildTestDataImportValue(current, imported, mode);
}

function testDataImportConfirmation(prepared, mode){
  const lines = ['products', 'seasons', 'households', 'qualityTests', 'outputs', 'procurements']
    .filter(key => Object.hasOwn(prepared.data, key))
    .map(key => `${prepared.counts[key]} ${IMPORT_LABELS[key].toLowerCase()}`);
  return showConfirmDialog(
    'Nhập dữ liệu test?',
    `Bạn sắp nhập:\n${lines.join('\n') || 'Không có dataset hợp lệ'}\n\nChế độ: ${mode === 'replace' ? 'Thay thế dữ liệu hiện tại' : 'Thêm vào dữ liệu hiện tại'}\n\nHành động này sẽ ghi dữ liệu lên hệ thống.`,
    'Xác nhận nhập',
    mode === 'replace'
  );
}

async function importTestData(){
  if(!isSuperAdmin){
    toast('Chỉ Quản trị viên xã mới có quyền nhập dữ liệu test', 'warn');
    return;
  }
  if(!testDataImport){
    toast('Vui lòng chọn file JSON hợp lệ trước khi nhập', 'warn');
    return;
  }

  const keys = IMPORTABLE_KEYS.filter(key => Object.hasOwn(testDataImport.data, key));
  if(keys.length === 0){
    toast('File không có dataset hợp lệ để nhập', 'warn');
    return;
  }
  const mode = document.querySelector('input[name="testDataImportMode"]:checked')?.value || 'replace';
  if(!await testDataImportConfirmation(testDataImport, mode)) return;

  setBtnLoading('testDataImportSubmit', true, 'Nhập dữ liệu');
  const results = testDataImport.invalid.map(item => ({ ...item, ok: false }));
  let importedCount = 0;
  try{
    for(const key of keys){
      const value = testDataImportTarget(key, testDataImport.data[key], mode);
      const saved = await saveAppData(key, value);
      if(saved.ok){
        applyAppDataValue(key, value);
        importedCount += testDataImport.counts[key];
        results.push({ key, ok: true });
      }else{
        results.push({ key, ok: false, reason: saved.error });
      }
    }

    const succeeded = results.filter(item => item.ok);
    if(succeeded.length === 0){
      renderTestDataImportStatus(results);
      toast('Không thể nhập dữ liệu test', 'warn');
      return;
    }

    const summary = `${testDataImport.counts.products || 0} sản phẩm, ${testDataImport.counts.seasons || 0} mùa vụ, ${testDataImport.counts.households || 0} hộ trồng`;
    const logged = await logActivity(`Quản trị viên đã nhập dữ liệu test từ file: ${testDataImport.fileName} (${summary}).`);
    if(!logged?.ok) results.push({ key: 'activity', ok: false, reason: logged?.error || 'Không thể ghi nhật ký hoạt động.' });

    renderAll();
    if(results.some(item => !item.ok)){
      renderTestDataImportStatus(results);
      toast('Đã nhập một phần dữ liệu test', 'warn');
      return;
    }
    closeTestDataImportModal();
    toast(`Đã nhập dữ liệu test thành công (${importedCount} bản ghi)`, 'ok');
  }finally{
    setBtnLoading('testDataImportSubmit', false, 'Nhập dữ liệu');
  }
}

function downloadSampleTestJson(){
  if(!isSuperAdmin){
    toast('Chỉ Quản trị viên xã mới có quyền nhập dữ liệu test', 'warn');
    return;
  }
  const sample = {
    seasons: [
      { id: 1, name: 'Vụ rau an toàn Thu Đông 2026', crop: 'Cải xanh', householdId: 1, region: 'Ấp Bốn Phú', start: '2026-09-01', end: '2026-12-15', area: 1.5, yieldTon: 18, price: 14500, specialty: false, status: 'growing' },
      { id: 2, name: 'Vụ Cà chua VietGAP 2026', crop: 'Cà chua', householdId: 2, region: 'Ấp Bốn Phú', start: '2026-08-15', end: '2026-11-30', area: 2.0, yieldTon: 25, price: 28000, specialty: false, status: 'harvesting' },
      { id: 3, name: 'Vụ Chôm chôm đường chín sớm 2026', crop: 'Chôm chôm', householdId: 3, region: 'Ấp An Hòa', start: '2026-05-01', end: '2026-09-20', area: 3.2, yieldTon: 40, price: 45000, specialty: true, status: 'harvesting' },
      { id: 4, name: 'Vụ Sơ ri xuất khẩu 2026', crop: 'Sơ ri', householdId: 4, region: 'Ấp An Hòa', start: '2026-06-10', end: '2026-10-30', area: 1.8, yieldTon: 22, price: 35000, specialty: true, status: 'harvesting' },
      { id: 5, name: 'Vụ Rau muống nước sông Sài Gòn', crop: 'Rau muống', householdId: 5, region: 'Ấp 1', start: '2026-09-01', end: '2026-10-15', area: 1.0, yieldTon: 12, price: 18000, specialty: false, status: 'growing' }
    ],
    households: [
      { id: 1, name: 'Nguyễn Văn Bình', ap: 'Ấp Bốn Phú', crop: 'Cải xanh', area: 1.5, years: 6, phone: '0900000001', note: 'Hệ thống tưới tự động' },
      { id: 2, name: 'Trần Thị Mai', ap: 'Ấp Bốn Phú', crop: 'Cà chua', area: 2.0, years: 8, phone: '0900000002', note: 'Nhà màng công nghệ cao' },
      { id: 3, name: 'Lê Văn Sáu', ap: 'Ấp An Hòa', crop: 'Chôm chôm', area: 3.2, years: 15, phone: '0900000003', note: 'Vườn chôm chôm hữu cơ ven sông' },
      { id: 4, name: 'Phạm Thị Hạnh', ap: 'Ấp An Hòa', crop: 'Sơ ri', area: 1.8, years: 10, phone: '0900000004', note: 'Canh tác theo chuẩn GlobalGAP' },
      { id: 5, name: 'Võ Văn Được', ap: 'Ấp 1', crop: 'Rau muống', area: 1.0, years: 5, phone: '0900000005', note: 'Nước nguồn phù sa tự nhiên' }
    ],
    qualityTests: [
      { id: 1, seasonId: 1, metric: 'Dư lượng thuốc BVTV', value: 0.01, unit: 'mg/kg', standard: 'VietGAP / Nội địa', threshold: 0.1, date: '2026-10-10', lab: 'Trung tâm kiểm định Bình Mỹ', result: 'pass', note: 'Đạt ngưỡng an toàn' },
      { id: 2, seasonId: 2, metric: 'Nitrat (NO3-)', value: 120, unit: 'mg/kg', standard: 'VietGAP / Nội địa', threshold: 500, date: '2026-09-20', lab: 'Quatest 3', result: 'pass', note: 'Hàm lượng nitrat an toàn' },
      { id: 3, seasonId: 3, metric: 'Kim loại nặng (Chì Pb)', value: 0.005, unit: 'mg/kg', standard: 'Xuất khẩu (GlobalGAP/MRL quốc tế)', threshold: 0.02, date: '2026-09-05', lab: 'Eurofins Sắc Ký Hải Đăng', result: 'pass', note: 'Đạt chuẩn xuất khẩu' },
      { id: 4, seasonId: 4, metric: 'Vi sinh E. coli', value: 0, unit: 'CFU/g', standard: 'VietGAP / Nội địa', threshold: 10, date: '2026-09-12', lab: 'Trung tâm kiểm định Bình Mỹ', result: 'pass', note: 'Âm tính vi sinh gây hại' }
    ],
    outputs: [
      { id: 1, seasonId: 1, buyer: 'HTX Nông sản Xanh Bình Mỹ', channel: 'Chợ đầu mối', volume: 8, price: 14500, date: '2026-12-12', status: 'completed', note: '' },
      { id: 2, seasonId: 2, buyer: 'Siêu thị Co.opmart Củ Chi', channel: 'Siêu thị / cửa hàng thực phẩm sạch', volume: 10, price: 28000, date: '2026-11-20', status: 'completed', note: 'Giao hàng đợt 1' }
    ],
    procurements: [
      { id: 1, postedDate: '2026-09-15', title: 'Thu mua cải xanh an toàn', buyer: 'HTX Nông sản Xanh Bình Mỹ', crop: 'Cải xanh', ap: 'Ấp Bốn Phú', quantity: 8, unitLabel: 'tấn', priceOffer: 14500, requirement: 'Rau tươi, đồng đều, chuẩn VietGAP', deadline: '2026-09-25', contactName: 'Nguyễn Minh Anh', contactPhone: '0900000002', note: '', status: 'open', ownerUsername: 'admin', applicants: [] },
      { id: 2, postedDate: '2026-09-10', title: 'Thu mua chôm chôm xuất khẩu', buyer: 'Công ty Xuất nhập khẩu Trái Cây Miền Nam', crop: 'Chôm chôm', ap: 'Ấp An Hòa', quantity: 15, unitLabel: 'tấn', priceOffer: 45000, requirement: 'Trái chín đều, không dập', deadline: '2026-09-30', contactName: 'Trần Văn Tiến', contactPhone: '0900000006', note: '', status: 'open', ownerUsername: 'admin', applicants: [] }
    ],
    products: [
      {
        id: 1,
        productCode: 'BM-2026-001',
        batchCode: 'LÔ-01',
        name: 'Cải xanh an toàn Bình Mỹ',
        sellerName: 'Nguyễn Văn Bình',
        ap: 'Ấp Bốn Phú',
        quantity: 120,
        unitLabel: 'kg',
        price: 25000,
        harvestDate: '2026-09-14',
        certification: 'VietGAP',
        image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
        contactName: 'Nguyễn Văn Bình',
        contactPhone: '0900000001',
        note: 'Rau cải xanh tươi giòn thu hoạch sáng sớm, không thuốc trừ sâu hóa học.',
        status: 'available',
        postedDate: '2026-09-14',
        ownerUsername: 'admin',
        buyRequests: []
      },
      {
        id: 2,
        productCode: 'BM-2026-002',
        batchCode: 'LÔ-02',
        name: 'Cà chua bi hữu cơ',
        sellerName: 'Trần Thị Mai',
        ap: 'Ấp Bốn Phú',
        quantity: 80,
        unitLabel: 'kg',
        price: 30000,
        harvestDate: '2026-09-15',
        certification: 'VietGAP',
        image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80',
        contactName: 'Trần Thị Mai',
        contactPhone: '0900000002',
        note: 'Cà chua ngọt đậm, vỏ mỏng, trồng trong nhà màng công nghệ cao.',
        status: 'available',
        postedDate: '2026-09-15',
        ownerUsername: 'admin',
        buyRequests: []
      },
      {
        id: 3,
        productCode: 'BM-2026-003',
        batchCode: 'LÔ-03',
        name: 'Chôm chôm Thái Bình Mỹ',
        sellerName: 'Lê Văn Sáu',
        ap: 'Ấp An Hòa',
        quantity: 50,
        unitLabel: 'kg',
        price: 45000,
        harvestDate: '2026-09-13',
        certification: 'Xuất khẩu (GlobalGAP)',
        image: 'https://images.unsplash.com/photo-1587132137056-bfbf0166836e?auto=format&fit=crop&w=600&q=80',
        contactName: 'Lê Văn Sáu',
        contactPhone: '0900000003',
        note: 'Chôm chôm cùi dày tróc hột, vị ngọt thanh mát, hái tại vườn ven sông.',
        status: 'available',
        postedDate: '2026-09-13',
        ownerUsername: 'admin',
        buyRequests: []
      },
      {
        id: 4,
        productCode: 'BM-2026-004',
        batchCode: 'LÔ-04',
        name: 'Sơ ri ngọt An Hòa',
        sellerName: 'Phạm Thị Hạnh',
        ap: 'Ấp An Hòa',
        quantity: 35,
        unitLabel: 'kg',
        price: 35000,
        harvestDate: '2026-09-14',
        certification: 'VietGAP',
        image: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=600&q=80',
        contactName: 'Phạm Thị Hạnh',
        contactPhone: '0900000004',
        note: 'Sơ ri chín mọng, giàu vitamin C, hái tuyển từng trái.',
        status: 'available',
        postedDate: '2026-09-14',
        ownerUsername: 'admin',
        buyRequests: []
      },
      {
        id: 5,
        productCode: 'BM-2026-005',
        batchCode: 'LÔ-05',
        name: 'Rau muống nước sạch Bình Mỹ',
        sellerName: 'Võ Văn Được',
        ap: 'Ấp 1',
        quantity: 150,
        unitLabel: 'kg',
        price: 18000,
        harvestDate: '2026-09-15',
        certification: 'Chưa kiểm định',
        image: 'https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&w=600&q=80',
        contactName: 'Võ Văn Được',
        contactPhone: '0900000005',
        note: 'Rau muống ngọn non, thân giòn nước, trồng theo nguồn nước tự nhiên.',
        status: 'available',
        postedDate: '2026-09-15',
        ownerUsername: 'admin',
        buyRequests: []
      }
    ],
    activity: []
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'binh-my-test-data.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderAccountsTable(){
  const body = document.getElementById('accountsTableBody');
  if(!body) return;
  if(admins.length === 0){
    body.innerHTML = emptyRow(4, 'Chưa có tài khoản nào.');
    return;
  }
  body.innerHTML = admins.map(a => `
    <tr>
      <td><strong>${esc(a.user)}</strong>${a.uid === currentUser.uid ? ' <span class="chip chip-growing">Tài khoản của bạn</span>' : ''}</td>
      <td>${roleLabel(a.role)}</td>
      <td>${esc(a.ap) || 'Toàn xã'}</td>
      <td class="row-actions">
        <button class="btn btn-sm" onclick="openAccountForm('${a.uid}')">Sửa</button>
        ${a.uid !== currentUser.uid ? `<button class="btn btn-sm btn-danger" onclick="deleteAccount('${a.uid}')">Xóa</button>` : ''}
      </td>
    </tr>`).join('');
}

function toggleAccountApField(){
  const field = document.getElementById('acc_ap_field');
  if(field){
    field.style.display = document.getElementById('acc_role').value === 'ward' ? 'block' : 'none';
  }
}

function openAccountForm(uid){
  if(!isSuperAdmin) return;
  document.getElementById('accountFormError').style.display = 'none';
  document.getElementById('accountFormOverlay').classList.add('show');
  if(uid){
    const a = admins.find(x => x.uid === uid);
    document.getElementById('accountFormTitle').textContent = 'Sửa tài khoản cán bộ';
    document.getElementById('acc_editUser').value = uid;
    document.getElementById('acc_user').value = a.user;
    document.getElementById('acc_user').disabled = true;
    document.getElementById('acc_pass').value = '';
    document.getElementById('acc_pass').placeholder = 'Để trống nếu không đổi mật khẩu';
    document.getElementById('acc_pass').disabled = true;
    document.getElementById('acc_role').value = a.role;
    document.getElementById('acc_ap').value = a.ap || '';
  }else{
    document.getElementById('accountFormTitle').textContent = 'Thêm tài khoản cán bộ';
    document.getElementById('acc_editUser').value = '';
    document.getElementById('acc_user').value = '';
    document.getElementById('acc_user').disabled = false;
    document.getElementById('acc_pass').value = '';
    document.getElementById('acc_pass').placeholder = '••••••';
    document.getElementById('acc_pass').disabled = false;
    document.getElementById('acc_role').value = 'ward';
    document.getElementById('acc_ap').value = '';
  }
  toggleAccountApField();
}

function closeAccountForm(){
  document.getElementById('accountFormOverlay').classList.remove('show');
}

async function saveAccountForm(){
  const editUid = document.getElementById('acc_editUser').value;
  const user = document.getElementById('acc_user').value.trim();
  const pass = document.getElementById('acc_pass').value;
  const role = document.getElementById('acc_role').value;
  const ap = role === 'ward' ? document.getElementById('acc_ap').value.trim() : null;
  const err = document.getElementById('accountFormError');

  if(!isEmail(user) || (!editUid && !pass) || (role === 'ward' && !ap)){
    err.textContent = !isEmail(user) ? 'Vui lòng nhập định dạng email hợp lệ cho tài khoản.' : 'Vui lòng nhập đầy đủ thông tin.';
    err.style.display = 'block';
    return;
  }
  if(!editUid && pass.length < 8){
    err.textContent = 'Mật khẩu phải có ít nhất 8 ký tự.';
    err.style.display = 'block';
    return;
  }

  try{
    if(editUid){
      await updateDoc(doc(db, 'admins', editUid), { role, ap });
      if(currentUser.uid === editUid) currentUser = { ...currentUser, role, ap };
    }else{
      if(admins.some(a => a.user === user)){
        err.textContent = 'Tên tài khoản này đã tồn tại.';
        err.style.display = 'block';
        return;
      }
      const uid = await createAuthUserWithoutSignIn(adminEmail(user), pass);
      await setDoc(doc(db, 'admins', uid), { user, role, ap });
    }
    await logActivity((editUid ? 'Cập nhật tài khoản cán bộ: ' : 'Thêm tài khoản cán bộ mới: ') + user + ' (' + roleLabel(role) + ')');
    closeAccountForm();
    renderAccountsTable();
    renderAll();
    toast('Đã lưu thông tin tài khoản', 'ok');
  }catch(e){
    err.textContent = 'Lỗi: ' + e.message;
    err.style.display = 'block';
  }
}

async function deleteAccount(uid){
  const target = admins.find(a => a.uid === uid);
  if(!target) return;
  if(uid === currentUser.uid){
    toast('Không thể tự xóa tài khoản đang đăng nhập', 'warn');
    return;
  }
  const remainingSupers = admins.filter(a => a.role === 'super' && a.uid !== uid);
  if(target.role === 'super' && remainingSupers.length === 0){
    toast('Hệ thống phải giữ lại ít nhất 1 Quản trị viên xã', 'warn');
    return;
  }
  const ok = await showConfirmDialog(
    'Xóa tài khoản cán bộ',
    `Xóa tài khoản "${target.user}" (${roleLabel(target.role)}) khỏi danh sách phân quyền?`,
    'Xóa tài khoản',
    true
  );
  if(!ok) return;

  await deleteDoc(doc(db, 'admins', uid));
  await logActivity('Xóa tài khoản cán bộ: ' + target.user);
  renderAccountsTable();
  toast('Đã xóa tài khoản', 'warn');
}

/* ============ Quản lý mùa vụ (Thêm / Sửa / Xóa) ============ */
function openForm(id){
  if(id && !canManage(seasons.find(x => x.id === id)?.region)){
    toast('Bạn không có quyền sửa mùa vụ này', 'warn');
    return;
  }
  clearFieldErrors('formOverlay');
  document.getElementById('formOverlay').classList.add('show');
  const hhSelect = document.getElementById('f_household');
  hhSelect.innerHTML = '<option value="">— Chưa gán hộ trồng —</option>' +
    households.map(h => `<option value="${h.id}">${esc(h.name)} (${esc(h.ap)})</option>`).join('');
  const regionInput = document.getElementById('f_region');

  if(id){
    const s = seasons.find(x => x.id === id);
    document.getElementById('formTitle').textContent = 'Sửa thông tin mùa vụ';
    document.getElementById('editId').value = id;
    document.getElementById('f_name').value = s.name;
    document.getElementById('f_crop').value = s.crop;
    hhSelect.value = s.householdId || '';
    regionInput.value = s.region;
    document.getElementById('f_start').value = s.start;
    document.getElementById('f_end').value = s.end;
    document.getElementById('f_area').value = s.area;
    document.getElementById('f_yield').value = s.yieldTon;
    document.getElementById('f_price').value = s.price || '';
    document.getElementById('f_specialty').checked = !!s.specialty;
    document.getElementById('f_status').value = s.status;
  }else{
    document.getElementById('formTitle').textContent = 'Thêm mùa vụ canh tác';
    document.getElementById('editId').value = '';
    hhSelect.value = '';
    ['f_name','f_crop','f_region','f_start','f_end','f_area','f_yield','f_price'].forEach(k => document.getElementById(k).value = '');
    document.getElementById('f_specialty').checked = false;
    document.getElementById('f_status').value = 'plan';
    if(currentUser && currentUser.role === 'ward') regionInput.value = currentUser.ap;
  }
  regionInput.disabled = !!(currentUser && currentUser.role === 'ward');
}

function closeForm(){
  document.getElementById('formOverlay').classList.remove('show');
  document.getElementById('f_region').disabled = false;
  clearFieldErrors('formOverlay');
}

async function saveForm(){
  if(!isAdmin){
    toast('Chỉ cán bộ nông nghiệp có quyền lưu mùa vụ', 'warn');
    return;
  }
  clearFieldErrors('formOverlay');

  const id = document.getElementById('editId').value;
  const nameVal = document.getElementById('f_name').value.trim();
  const cropVal = document.getElementById('f_crop').value.trim();
  const regionVal = (currentUser && currentUser.role === 'ward') ? currentUser.ap : document.getElementById('f_region').value.trim();
  const startVal = document.getElementById('f_start').value;
  const endVal = document.getElementById('f_end').value;
  const areaVal = document.getElementById('f_area').value.trim();
  const yieldVal = document.getElementById('f_yield').value.trim();

  let hasErr = false;
  if(!nameVal){
    setFieldError('f_name', 'err_f_name', 'Vui lòng nhập tên mùa vụ.');
    hasErr = true;
  }
  if(!cropVal){
    setFieldError('f_crop', 'err_f_crop', 'Vui lòng nhập loại cây trồng.');
    hasErr = true;
  }
  if(!regionVal){
    setFieldError('f_region', 'err_f_region', 'Vui lòng chọn hoặc nhập ấp canh tác.');
    hasErr = true;
  }
  if(startVal && endVal && endVal < startVal){
    setFieldError('f_end', 'err_f_end', 'Ngày kết thúc không thể trước ngày bắt đầu.');
    hasErr = true;
  }
  if(!areaVal || Number(areaVal) <= 0){
    setFieldError('f_area', 'err_f_area', 'Diện tích canh tác phải lớn hơn 0.');
    hasErr = true;
  }
  if(yieldVal === '' || Number(yieldVal) < 0){
    setFieldError('f_yield', 'err_f_yield', 'Sản lượng thu hoạch không hợp lệ.');
    hasErr = true;
  }
  if(hasErr) return;

  const record = {
    name: nameVal,
    crop: cropVal,
    householdId: document.getElementById('f_household').value ? Number(document.getElementById('f_household').value) : null,
    region: regionVal,
    start: startVal,
    end: endVal,
    area: Number(areaVal),
    yieldTon: Number(yieldVal || 0),
    price: Number(document.getElementById('f_price').value || 0),
    specialty: document.getElementById('f_specialty').checked,
    status: document.getElementById('f_status').value
  };

  if(!canManage(record.region)){
    toast('Bạn không có quyền phụ trách địa bàn ấp này', 'warn');
    return;
  }

  setBtnLoading('btnSaveSeason', true);
  try{
    if(id){
      const idx = seasons.findIndex(x => x.id === Number(id));
      seasons[idx] = { ...seasons[idx], ...record };
    }else{
      const newId = seasons.length ? Math.max(...seasons.map(s => s.id)) + 1 : 1;
      seasons.push({ id: newId, ...record });
    }
    await saveSeasons();
    await logActivity((id ? 'Cập nhật mùa vụ: ' : 'Thêm mùa vụ mới: ') + record.name + ' — bởi ' + currentUser.user);
    closeForm();
    renderAll();
    toast('Đã lưu thông tin mùa vụ', 'ok');
  }catch(e){
    console.error(e);
    toast('Lỗi khi lưu mùa vụ: ' + e.message, 'warn');
  }finally{
    setBtnLoading('btnSaveSeason', false);
  }
}

async function deleteSeason(id){
  const s = seasons.find(x => x.id === id);
  if(!canManage(s?.region)){
    toast('Bạn không có quyền xóa mùa vụ này', 'warn');
    return;
  }

  // ĐÃ SỬA: Kiểm tra dữ liệu liên kết (kiểm định chất lượng & đầu ra) để tránh mồ côi dữ liệu
  const depTests = qualityTests.filter(q => q.seasonId === id).length;
  const depOutputs = outputs.filter(o => o.seasonId === id).length;

  let msg = `Bạn có chắc muốn xóa mùa vụ "${s?.name}"?`;
  if(depTests > 0 || depOutputs > 0){
    msg += `\nLưu ý: Mùa vụ này đang có ${depTests} lần kiểm định và ${depOutputs} giao dịch đầu ra liên kết. Khi xóa, các dữ liệu này sẽ được hủy gán mùa vụ để bảo toàn báo cáo.`;
  }

  const ok = await showConfirmDialog('Xác nhận xóa mùa vụ', msg, 'Xóa mùa vụ', true);
  if(!ok) return;

  seasons = seasons.filter(x => x.id !== id);
  qualityTests.forEach(q => { if(q.seasonId === id) q.seasonId = null; });
  outputs.forEach(o => { if(o.seasonId === id) o.seasonId = null; });

  await saveSeasons();
  await saveQualityTests();
  await saveOutputs();
  await logActivity('Xóa mùa vụ: ' + (s ? s.name : '') + ' — bởi ' + currentUser.user);
  renderAll();
  toast('Đã xóa mùa vụ và cập nhật các liên kết', 'warn');
}

/* ============ Trợ lý AI nông nghiệp (Cloud Function + Động cơ phân tích cục bộ) ============ */
async function apiAskAI(prompt){
  const callAskAI = httpsCallable(functions, 'askAI');
  const result = await callAskAI({ prompt });
  const text = result?.data?.text;
  if(!text) throw new Error('Không có phản hồi từ máy chủ AI');
  return text;
}

// Động cơ phân tích dữ liệu cục bộ chạy 100% khi Cloud Function chưa triển khai hoặc mất mạng
function askLocalAI(question){
  const q = question.toLowerCase();

  // 1. Phân tích năng suất mùa vụ
  if(q.includes('năng suất thấp') || q.includes('kém nhất') || q.includes('sản lượng thấp')){
    if(seasons.length === 0) return 'Hiện chưa có dữ liệu mùa vụ nào trong hệ thống để phân tích năng suất.';
    const validSeasons = seasons.filter(s => Number(s.area || 0) > 0);
    const sortedByYield = [...validSeasons].sort((a, b) => seasonYieldPerHa(a) - seasonYieldPerHa(b));
    const lowest = sortedByYield[0];
    const lowYieldVal = seasonYieldPerHa(lowest).toFixed(2);
    return `📊 **Phân tích năng suất:**\n- Mùa vụ có năng suất thấp nhất hiện nay là **${lowest.name}** (${lowest.crop} tại ${lowest.region}), đạt **${lowYieldVal} tấn/ha** (sản lượng ${lowest.yieldTon} tấn trên diện tích ${lowest.area} ha).\n- **Đề xuất khắc phục:** Hộ trồng nên kiểm tra lại hệ thống tưới tiêu ven sông, bổ sung phân hữu cơ vi sinh và đối chiếu lịch bón phân cân đối giữa đạm, lân, kali theo khuyến cáo của Chi cục Trồng trọt & BVTV.`;
  }

  // 2. Phân tích kiểm định an toàn thực phẩm
  if(q.includes('kiểm định') || q.includes('không đạt') || q.includes('chất lượng') || q.includes('dư lượng')){
    const failed = qualityTests.filter(t => t.result === 'fail');
    if(failed.length === 0){
      return `✅ **Báo cáo an toàn thực phẩm:**\nHiện tại **100% các lần kiểm định đã có kết quả đều đạt chuẩn an toàn** (VietGAP/Siêu thị/Xuất khẩu). Toàn xã ghi nhận ${qualityTests.length} lượt kiểm nghiệm không phát hiện dư lượng hóa chất vượt ngưỡng cho phép.`;
    }
    const details = failed.map(f => `- **${seasonLabel(f.seasonId)}**: Chỉ tiêu *${f.metric}* đo được ${f.value} ${f.unit || ''} (vượt ngưỡng cho phép ${f.threshold} ${f.unit || ''}). Tiêu chuẩn: ${f.standard}.`).join('\n');
    return `⚠️ **Cảnh báo kiểm định chất lượng:**\nHiện có **${failed.length} chỉ tiêu kiểm định chưa đạt chuẩn**:\n${details}\n\n💡 **Khuyến nghị kỹ thuật:**\n1. Kéo dài thời gian cách ly trước thu hoạch (tối thiểu 14 ngày đối với thuốc BVTV sinh học).\n2. Giảm liều lượng phân đạm nitrat, thay thế bằng phân chuồng hoai mục ủ nấm Trichoderma.\n3. Lấy mẫu xét nghiệm lại trước khi đóng gói xuất xưởng.`;
  }

  // 3. Tư vấn đầu ra cho cây trồng (chôm chôm, rau, sơ ri...)
  if(q.includes('đầu ra') || q.includes('chôm chôm') || q.includes('tiêu thụ') || q.includes('thương lái')){
    const openProcs = procurements.filter(p => p.status === 'open');
    const matched = openProcs.filter(p => p.crop.toLowerCase().includes('chôm chôm') || p.crop.toLowerCase().includes('trái cây') || p.crop.toLowerCase().includes('rau'));
    let text = `🤝 **Gợi ý kết nối đầu ra:**\n`;
    if(matched.length > 0){
      text += `Hiện đang có **${matched.length} tin thu mua phù hợp** trên hệ thống:\n` +
        matched.map(m => `- Tin: **${m.title}** (${m.buyer}) — Cần ${m.quantity} ${m.unitLabel || 'tấn'} ${m.crop} tại ${m.ap}. Giá chào mua: ${m.priceOffer ? money(m.priceOffer) + ' đ/kg' : 'Thỏa thuận'}.`).join('\n');
    }else{
      text += `Hiện các tin thu mua chuyên biệt đang đủ nguồn. Tuy nhiên qua thống kê kênh tiêu thụ xã, kênh **Siêu thị trong nước** và **Chợ đầu mối Hóc Môn/Thủ Đức** đang giữ giá bình ổn cao nhất cho nông sản Bình Mỹ (khoảng 35.000 - 55.000 đ/kg đối với trái cây đạt chuẩn VietGAP).`;
    }
    return text;
  }

  // 4. Giá trị kinh tế toàn xã
  if(q.includes('giá trị') || q.includes('kinh tế') || q.includes('tổng doanh thu') || q.includes('ước tính')){
    const totalRev = seasons.reduce((a, s) => a + seasonRevenue(s), 0);
    const totalYield = seasons.reduce((a, s) => a + Number(s.yieldTon || 0), 0);
    const totalArea = seasons.reduce((a, s) => a + Number(s.area || 0), 0);
    const outRev = outputs.filter(o => o.status === 'done').reduce((a, o) => a + outputRevenue(o), 0);

    return `💰 **Ước tính kinh tế nông nghiệp xã Bình Mỹ:**\n- **Tổng giá trị thu hoạch ước tính:** **${money(totalRev)} đ** (~${(totalRev / 1000000000).toFixed(2)} tỷ đồng).\n- **Tổng sản lượng:** ${money(totalYield)} tấn trên ${money(totalArea)} ha đất canh tác.\n- **Doanh thu đã thực hiện qua hợp đồng:** ${money(outRev)} đ.\n- **Giá trị trung bình mỗi hecta:** ${totalArea > 0 ? money(Math.round(totalRev / totalArea)) : 0} đ/ha.`;
  }

  // 5. Câu trả lời tổng hợp mặc định
  return `🌾 **Trợ lý Nông nghiệp Bình Mỹ:**\nHệ thống hiện đang quản lý **${seasons.length} mùa vụ**, **${households.length} hộ trồng**, **${procurements.length} tin thu mua** và **${products.length} mặt hàng chào bán**.\n\nBạn có thể hỏi tôi chi tiết về:\n- Năng suất và diện tích từng ấp (Ấp Bốn Phú, Ấp 6, Ấp 7...)\n- Chỉ tiêu kiểm định chất lượng và dư lượng thuốc BVTV\n- Kết nối đối tác thu mua và giá nông sản hôm nay.`;
}

function renderChat(){
  const log = document.getElementById('chatLog');
  if(!log) return;
  if(chatHistory.length === 0){
    log.innerHTML = `
      <div class="bubble bubble-ai">
        Xin chào! Tôi là Trợ lý AI nông nghiệp xã Bình Mỹ. Tôi có thể hỗ trợ bạn phân tích năng suất mùa vụ, cảnh báo chỉ tiêu kiểm định chất lượng, tìm đối tác thu mua và tính toán giá trị kinh tế. Hãy chọn gợi ý bên dưới hoặc nhập câu hỏi của bạn!
      </div>`;
    return;
  }

  log.innerHTML = chatHistory.map(m => {
    const cls = 'bubble ' + (m.role === 'user' ? 'bubble-user' : 'bubble-ai') + (m.loading ? ' loading' : '');
    const content = m.loading
      ? '<span class="typing-dots"><span></span><span></span><span></span></span>'
      : esc(m.text).replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return `<div class="${cls}">${content}</div>`;
  }).join('');
  log.scrollTop = log.scrollHeight;
}

function renderAiSuggestions(){
  const el = document.getElementById('aiSuggestions');
  if(!el) return;
  el.innerHTML = AI_SUGGESTIONS.map(q => `<button type="button" class="ai-chip" onclick="askAI('${q.replace(/'/g, "\\'")}')">${esc(q)}</button>`).join('');
}

function clearChatHistory(){
  chatHistory = [];
  renderChat();
  toast('Đã làm mới cuộc hội thoại với trợ lý AI', 'ok');
}

async function askAI(preset){
  const input = document.getElementById('aiQuestion');
  const question = (typeof preset === 'string') ? preset : input?.value.trim();
  if(!question){
    toast('Vui lòng nhập câu hỏi trước khi gửi', 'warn');
    return;
  }
  if(input) input.value = '';

  chatHistory.push({ role: 'user', text: question });
  chatHistory.push({ role: 'ai', text: 'Đang phân tích số liệu thực tế...', loading: true });
  renderChat();

  const btn = document.getElementById('askAiBtn');
  if(btn) btn.disabled = true;

  try{
    // Tạo bản tóm tắt ngữ cảnh cho Cloud Function & AI
    const productSummary = products.map(p =>
      `- ${p.name} (Mã: ${p.productCode || p.id}) | Hộ trồng: ${p.sellerName || '—'} | Ấp: ${p.ap || 'Bình Mỹ'} | Giá: ${p.price || 0}đ/${p.unitLabel || 'kg'} | Tình trạng: ${p.status === 'available' ? 'Còn hàng' : 'Hết hàng'} | Chứng nhận: ${p.certification || 'Chưa kiểm định'}`
    ).join('\n');

    const dataSummary = seasons.map(s =>
      `- ${s.name} | Cây: ${s.crop} | Ấp: ${s.region} | Diện tích: ${s.area}ha | Sản lượng: ${s.yieldTon} tấn | Giá TT: ${s.price || 0}đ | Doanh thu ước tính: ${seasonRevenue(s)}đ`
    ).join('\n');

    const qualitySummary = qualityTests.map(q =>
      `- Mùa vụ: ${seasonLabel(q.seasonId)} | Chỉ tiêu: ${q.metric} | Giá trị: ${q.value} (Ngưỡng: ${q.threshold}) | Kết quả: ${q.result}`
    ).join('\n');

    const prompt = `Bạn là Trợ lý Nông nghiệp thông minh xã Bình Mỹ, TP.HCM.
Dữ liệu sản phẩm nông sản đang bán & mã QR truy xuất:
${productSummary}

Dữ liệu mùa vụ hiện tại:
${dataSummary}

Dữ liệu kiểm định chất lượng:
${qualitySummary}

Câu hỏi: "${question}"
Hãy trả lời ngắn gọn, chân thành, thực tế, dễ hiểu đối với bà con nông dân và người tiêu dùng.`;

    let text;
    try{
      text = await apiAskAI(prompt);
    }catch(netErr){
      console.warn('Không thể gọi Cloud Function, kích hoạt động cơ phân tích cục bộ:', netErr);
      text = askLocalAI(question);
    }
    chatHistory[chatHistory.length - 1] = { role: 'ai', text };
  }catch(e){
    console.error('Lỗi trợ lý AI:', e);
    chatHistory[chatHistory.length - 1] = { role: 'ai', text: 'Có lỗi trong quá trình xử lý: ' + e.message };
  }finally{
    if(btn) btn.disabled = false;
    renderChat();
  }
}

/* ============ Điều hướng SPA & Hash Router Đa Nền Tảng ============ */
const VIEW_IDS = ['trang-chu', 'tin-thu-mua', 'kiem-dinh', 'tro-ly-ai', 'quan-ly'];

function isMobileViewport(){
  return window.innerWidth < 768;
}

function showView(id){
  // Nếu đang xem trên desktop màn hình lớn mà hash là trang chủ mobile -> tự động sang sản phẩm
  if(!isMobileViewport() && id === 'trang-chu'){
    id = 'tin-thu-mua';
  }
  if(!VIEW_IDS.includes(id)){
    id = isMobileViewport() ? 'trang-chu' : 'tin-thu-mua';
  }
  if(id === 'quan-ly' && !isAdmin){
    id = isMobileViewport() ? 'trang-chu' : 'tin-thu-mua';
    if(location.hash.slice(1) !== id){
      location.hash = id;
      return;
    }
  }

  VIEW_IDS.forEach(vid => {
    const el = document.getElementById(vid);
    if(el) el.classList.toggle('active-view', vid === id);
  });

  // Đồng bộ Desktop Quick Navigation Bar (#quickNavBar)
  syncQuickNavActive(id);

  // Đồng bộ Mobile Bottom Navigation Bar (#mobileBottomNav)
  document.querySelectorAll('.mobile-bottom-nav .m-nav-item').forEach(btn => {
    const navTarget = btn.getAttribute('data-mnav');
    if(navTarget){
      btn.classList.toggle('active', navTarget === id);
    }
  });

  window.scrollTo(0, 0);
}

function syncQuickNavActive(id){
  const nav = document.getElementById('quickNavBar');
  if(!nav) return;
  const currentSubtab = (id === 'tin-thu-mua')
    ? (document.querySelector('#dauRaTabs2 button.active')?.getAttribute('data-subtab') || 'dr2-products')
    : null;

  nav.querySelectorAll('.quick-nav-item').forEach(btn => {
    const target = btn.getAttribute('data-view');
    if(!target) return;
    if(id === 'tin-thu-mua'){
      btn.classList.toggle('active', target === currentSubtab);
    } else {
      btn.classList.toggle('active', target === id);
    }
  });
}

function updateNavAdminVisibility(){
  const quickAdmin = document.getElementById('quickNavAdmin');
  if(quickAdmin){
    quickAdmin.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  const mLinkAdmin = document.getElementById('mLinkAdmin');
  if(mLinkAdmin){
    mLinkAdmin.style.display = isAdmin ? 'flex' : 'none';
  }
  const mLinkLogin = document.getElementById('mLinkLogin');
  const mLinkLogout = document.getElementById('mLinkLogout');
  const mLoggedUser = document.getElementById('mLoggedUser');
  if(currentUser || currentPersonUser){
    if(mLinkLogin) mLinkLogin.style.display = 'none';
    if(mLinkLogout) mLinkLogout.style.display = 'flex';
    if(mLoggedUser){
      const uName = currentUser ? currentUser.user : (currentPersonUser.displayName || currentPersonUser.username);
      mLoggedUser.textContent = `Đang đăng nhập: ${uName}`;
    }
  } else {
    if(mLinkLogin) mLinkLogin.style.display = 'flex';
    if(mLinkLogout) mLinkLogout.style.display = 'none';
    if(mLoggedUser) mLoggedUser.textContent = '';
  }
}

function switchMobileNav(viewId){
  closeMobileMoreSheet();
  if(viewId === 'tin-thu-mua'){
    // Đảm bảo tab "Sản phẩm đang bán" được chọn khi bấm từ mobile bottom nav
    const tabBtn = document.querySelector('#dauRaTabs2 button[data-subtab="dr2-products"]');
    if(tabBtn) tabBtn.click();
  }
  location.hash = viewId;
  showView(viewId);
}

function openMobileMoreSheet(){
  const overlay = document.getElementById('moreMenuOverlay');
  if(overlay) overlay.classList.add('open');
}

function closeMobileMoreSheet(){
  const overlay = document.getElementById('moreMenuOverlay');
  if(overlay) overlay.classList.remove('open');
}

function switchToAdmin(){
  closeMobileMoreSheet();
  if(!isAdmin){
    openPersonAuth();
    toast('Vui lòng đăng nhập tài khoản Cán bộ để vào trang quản lý', 'warn');
    return;
  }
  location.hash = 'quan-ly';
  showView('quan-ly');
}

function initRouter(){
  const applyFromHash = () => {
    const hash = location.hash || '';
    if(hash.startsWith('#san-pham=')){
      checkDeepLinkProduct();
      showView(isMobileViewport() ? 'trang-chu' : 'tin-thu-mua');
      return;
    }
    const defaultView = isMobileViewport() ? 'trang-chu' : 'tin-thu-mua';
    showView((hash ? hash.slice(1) : defaultView));
  };
  window.addEventListener('hashchange', applyFromHash);
  applyFromHash();
}

function restoreAdminDeepLinkIfNeeded(){
  if(isAdmin && initialHash === 'quan-ly' && location.hash.slice(1) !== 'quan-ly'){
    location.hash = 'quan-ly';
  }
}

function initSubtabs(navId, subviewPrefix){
  const nav = document.getElementById(navId);
  if(!nav) return;
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-subtab]');
    if(!btn) return;
    const key = btn.getAttribute('data-subtab');
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    nav.parentElement.querySelectorAll('.subview').forEach(sv => {
      sv.classList.toggle('active-subview', sv.id === subviewPrefix + key);
    });
    if(navId === 'dauRaTabs2'){
      syncQuickNavActive('tin-thu-mua');
    }
  });
}

/* ============ Khởi động ứng dụng ============ */
(async function init(){
  initRouter();
  initSubtabs('quanLyTabs', 'subview-');
  initSubtabs('dauRaTabs2', 'subview-');

  try{
    await loadData();
    renderAll();
    updateNavAdminVisibility();
    renderAiSuggestions();
    renderChat();
    checkDeepLinkProduct();
  }catch(e){
    console.error('Lỗi khởi tạo dữ liệu:', e);
    toast('Có lỗi khi tải dữ liệu, hệ thống đang dùng bộ nhớ đệm', 'warn');
  }

  const loader = document.getElementById('appLoader');
  if(loader) loader.classList.add('hide');

  tickClock();
  setInterval(tickClock, 1000);

  // Lắng nghe sự kiện tìm kiếm và bộ lọc
  document.getElementById('searchSeason')?.addEventListener('input', debounce(renderTable, 250));
  document.getElementById('filterStatus')?.addEventListener('change', renderTable);
  document.getElementById('filterSeasonCrop')?.addEventListener('change', renderTable);
  document.getElementById('filterSeasonAp')?.addEventListener('change', renderTable);

  document.getElementById('searchHh')?.addEventListener('input', debounce(renderHouseholds, 250));
  document.getElementById('filterAp')?.addEventListener('change', renderHouseholds);

  document.getElementById('searchQuality')?.addEventListener('input', debounce(renderQuality, 250));
  document.getElementById('filterQualityResult')?.addEventListener('change', renderQuality);
  document.getElementById('filterQualityStandard')?.addEventListener('change', renderQuality);

  document.getElementById('searchOutput')?.addEventListener('input', debounce(renderOutputs, 250));
  document.getElementById('filterOutputStatus')?.addEventListener('change', renderOutputs);
  document.getElementById('filterOutputChannel')?.addEventListener('change', renderOutputs);

  document.getElementById('searchProc')?.addEventListener('input', debounce(renderProcurements, 250));
  document.getElementById('filterProcStatus')?.addEventListener('change', renderProcurements);
  document.getElementById('filterProcCrop')?.addEventListener('change', renderProcurements);

  document.getElementById('searchProduct')?.addEventListener('input', debounce(renderProducts, 250));
  document.getElementById('filterProductName')?.addEventListener('change', renderProducts);
  document.getElementById('filterProductStatus')?.addEventListener('change', renderProducts);
  document.getElementById('filterProductQuality')?.addEventListener('change', renderProducts);
  document.getElementById('filterProductCert')?.addEventListener('change', renderProducts);

  // Lắng nghe ô tìm kiếm sản phẩm trên Mobile
  const mSearch = document.getElementById('mobileSearchInput');
  if(mSearch){
    mSearch.addEventListener('input', debounce(() => {
      const clr = document.getElementById('mobileSearchClear');
      if(clr) clr.style.display = mSearch.value.trim() ? 'flex' : 'none';
      renderProducts();
    }, 250));
  }

  // Tự động điều chỉnh view nếu người dùng xoay màn hình hoặc co giãn cửa sổ trình duyệt
  window.addEventListener('resize', debounce(() => {
    const cur = (location.hash || '').slice(1);
    if(!isMobileViewport() && cur === 'trang-chu'){
      location.hash = 'tin-thu-mua';
      showView('tin-thu-mua');
    }
  }, 250));

  // Sắp xếp cột bảng Mùa vụ
  document.addEventListener('click', (e) => {
    const th = e.target.closest('#subview-ql-muavu th.sortable');
    if(!th) return;
    const key = th.getAttribute('data-sort');
    if(sortKey === key){ sortDir = -sortDir; } else { sortKey = key; sortDir = 1; }
    renderTable();
  });

  // Sắp xếp cột bảng Hộ trồng
  document.addEventListener('click', (e) => {
    const th = e.target.closest('#hhTable th.sortable');
    if(!th) return;
    const key = th.getAttribute('data-sort');
    if(hhSortKey === key){ hhSortDir = -hhSortDir; } else { hhSortKey = key; hhSortDir = 1; }
    renderHouseholds();
  });

  setupRealtime();
})();

/* ============ Xuất các hàm ra phạm vi toàn cục (Window) ============ */
Object.assign(window, {
  askAI, clearChatHistory, clearAiChat: clearChatHistory, closeConfirmModal, closeConfirmDialog: closeConfirmModal,
  closeAccountForm, closeAccountsModal, closeApplyForm, closeAuthMenuThen, closeBuyForm, closeForm, closeHhForm,
  closeOutputForm, closePersonAuth, closeProcForm, closeProcDetail, closeProductForm, closePwForm, closeQualityForm, closeResetOverlay,
  closeTestDataImportModal,
  deleteAccount, deleteHousehold, deleteOutput, deleteProcurement, deleteProduct, deleteQualityTest, deleteSeason,
  doPersonLogin, doPersonRegister, exportCsv, logout, personLogout,
  downloadSampleTestJson, importTestData,
  openAccountForm, openAccountsModal, openApplyForm, openBuyForm, openForm, openHhForm,
  openOutputForm, openPersonAuth, openProcForm, openProcDetail, openProductForm, openPwForm, openQualityForm, openResetOverlay,
  openTestDataImportModal, readTestDataImportFile,
  saveAccountForm, saveForm, saveHhForm, saveOutputForm, saveProcForm, saveProductForm, savePwForm, saveQualityForm,
  sendPasswordResetRequest, submitApplication, submitBuyRequest, switchPersonAuth,
  toggleAccountApField, toggleApplicants, toggleAuthMenu, toggleBuyers, toggleProcStatus, toggleProductStatus, togglePuApField,
  quickAddSeason, quickAddQuality, quickAddProc, quickOpenAI, quickFilterLowYield,

  // Các tính năng QR, chi tiết sản phẩm, điều hướng & hướng dẫn mới
  openQrScanner, closeQrScanner, switchCameraFacing, lookupManualCode, openManualLookup,
  showProductDetail, showProductDetailByCode, closeProductDetail,
  openProductQrModal, closeProductQrModal, downloadProductQr, printProductQr,
  openHelpModal, closeHelpModal,
  switchToDauRaProducts, switchToDauRaDemand, switchToQuality, switchToAI,
  handleOpenProductForm,

  // Xử lý xem ảnh lớn lightbox và ảnh form sản phẩm
  openProductLightbox, closeImageLightbox, switchDetailImage,
  previewProductFormImage, clearProductFormImage, handleProductFormImgError,
  clearAllProductFilters,

  // Các hàm điều hướng và tương tác Mobile mới
  switchMobileNav, openMobileMoreSheet, closeMobileMoreSheet, clearMobileSearch,
  switchToAdmin, renderMobileHomeStats
});
