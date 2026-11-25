/* ========================================================
   إعدادات النظام والخدمة - قصة الغسيل
======================================================== */
const CONFIG = {
  brandName: "قصة الغسيل",
  whatsapp: "966533719216",
  phoneDisplay: "0533719216",
  // --- الدفع بالتحويل البنكي (عبّئ بياناتك من SITE_CONFIG في config.js) ---
  bank: (window.SITE_CONFIG||{}).bank || { holder: "", name: "", iban: "" },
  // --- Moyasar: المفتاح العام فقط (pk_live_...) - لا تضع المفتاح السري هنا أبداً ---
  moyasarPublishableKey: (window.SITE_CONFIG||{}).moyasarPublishableKey || "",
  currency: "ر.س",
  supabaseUrl: (window.SITE_CONFIG||{}).supabaseUrl || "",
  supabaseKey: (window.SITE_CONFIG||{}).supabaseKey || "",
  area: {
    name: "الدوادمي",
    lat: 24.5077,
    lng: 44.3923,
    radiusKm: 25
  },
  // مواعيد منتظمة بفارق ساعة كاملة (من 2:00 م حتى 12:00 ص)
  slots: [
    "2:00 م",
    "3:00 م",
    "4:00 م",
    "5:00 م",
    "6:00 م",
    "7:00 م",
    "8:00 م",
    "9:00 م",
    "10:00 م",
    "11:00 م"
  ],
  pricing: {
    regular: {
      name: "باقة الغسيل العادي",
      small: 30,
      medium: 35,
      large: 40,
      features: [
        "غسيل خارجي نفاث بالرغوة الغنية",
        "كنس وتمسيح شامل للداخل والديكورات",
        "تكييس (الوطايات/الدعاسات، القير، الدركسون)",
        "تعطير فاخر يدوم طويلاً",
        "تلميع الكفرات والجنوط"
      ]
    },
    deep: {
      name: "باقة الغسيل العميق",
      small: 230,
      medium: 230,
      large: 280,
      features: [
        "غسيل احترافي للمراتب وإزالة أصعب البقع",
        "غسيل خارجي رغوي وتلميع البدي",
        "كنس وتمسيح شامل ودقيق للديكور والفتحات",
        "تكييس كامل (الوطايات، القير، والدركسون)",
        "تعطير فاخر مركز",
        "تلميع الكفرات وحمايتها"
      ]
    }
  },
  carSizes: {
    small: { title: "سيارة صغيرة", desc: "يارس، أكسنت، صني.." },
    medium: { title: "سيارة وسط", desc: "كامري، سوناتا، راف فور.." },
    large: { title: "سيارة كبيرة", desc: "تاهو، لاندكروزر، باترول.." }
  }
};

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const form = $("bookingForm");
const bookDate = $("bookDate");
const dayLabel = $("dayLabel");
const slotsContainer = $("slotsContainer");
const errorMsg = $("errorMsg");
const submitBtn = $("submitBtn");
const btnPriceTotal = $("btnPriceTotal");

const recPkg = $("recPkg");
const recSize = $("recSize");
const recDate = $("recDate");
const recSlot = $("recSlot");
const recPay = $("recPay");
const recTotal = $("recTotal");

let currentCoordinates = null;
let currentBookingData = null;
let otpTimerInterval = null;
let slotsRequestId = 0;

/* إعداد التاريخ */
const today = new Date();
bookDate.min = isoDate(today);
bookDate.value = isoDate(today);

function getArabicDayName(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString + "T12:00:00");
  return d.toLocaleDateString("ar-SA-u-ca-gregory", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function updateDayDisplay() {
  const text = getArabicDayName(bookDate.value);
  dayLabel.textContent = text || "—";
  recDate.textContent = text || "—";
}
bookDate.addEventListener("input", updateDayDisplay);
updateDayDisplay();

/* أوقات الساعات */
function renderSlots() {
  slotsContainer.innerHTML = CONFIG.slots.map((slot, idx) => `
    <label>
      <input type="radio" name="timeSlot" value="${slot}" class="slot-radio" ${idx === 0 ? "checked" : ""}>
      <div class="slot-label">
        <span>${slot}</span>
        <span class="slot-status-tag available">متاح ✓</span>
      </div>
    </label>
  `).join("");

  document.querySelectorAll('input[name="timeSlot"]').forEach(radio => {
    radio.addEventListener("change", updateLiveSummary);
  });
}
renderSlots();

async function loadWorkingHours() {
  try {
    const cached = localStorage.getItem("ls_working_hours");
    if (cached) {
      const arr = JSON.parse(cached);
      if (Array.isArray(arr) && arr.length > 0) {
        CONFIG.slots = arr;
        renderSlots();
      }
    }
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/site_settings?key=eq.working_hours&select=value`, {
      headers: { apikey: CONFIG.supabaseKey }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data[0] && data[0].value && Array.isArray(data[0].value.slots) && data[0].value.slots.length > 0) {
        CONFIG.slots = data[0].value.slots;
        localStorage.setItem("ls_working_hours", JSON.stringify(CONFIG.slots));
        renderSlots();
        if (typeof fetchTakenSlots === "function") fetchTakenSlots();
      }
    }
  } catch(e) {}
}
loadWorkingHours();

/* إدارة وحجز المواعيد بالساعة */
function getLocalBookedSlots(dateStr) {
  try {
    const raw = localStorage.getItem("qs_booked_slots");
    if (!raw) return [];
    const list = JSON.parse(raw);
    return list.filter(item => item.date === dateStr).map(item => item.slot);
  } catch (e) {
    return [];
  }
}

function saveLocalSlot(dateStr, slotStr, clientName) {
  try {
    const raw = localStorage.getItem("qs_booked_slots");
    const list = raw ? JSON.parse(raw) : [];
    list.push({ date: dateStr, slot: slotStr, name: clientName || "عميل", time: Date.now() });
    localStorage.setItem("qs_booked_slots", JSON.stringify(list));
  } catch (e) {}
}

const isDbConfigured = !!(CONFIG.supabaseUrl && CONFIG.supabaseKey);

async function fetchTakenSlots() {
  if (!bookDate.value) return;
  const targetDate = bookDate.value;
  const reqId = ++slotsRequestId;   // تجاهل الردود القديمة عند تغيير التاريخ بسرعة
  let taken = isDbConfigured ? [] : [...getLocalBookedSlots(targetDate)];
  let counts = {};   // الساعة -> { n: عدد الحجوزات, cap: السعة }

  if (isDbConfigured) {
    const hdr = {
      apikey: CONFIG.supabaseKey,
      ...(String(CONFIG.supabaseKey).startsWith("eyJ") ? { Authorization: `Bearer ${CONFIG.supabaseKey}` } : {}),
      "Content-Type": "application/json"
    };
    try {
      // الأفضل: عدد الحجوزات وسعة كل ساعة من السيرفر
      const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/slot_counts`, { method: "POST", headers: hdr, body: JSON.stringify({ d: targetDate }) });
      const rows = await res.json();
      if (res.ok && Array.isArray(rows)) {
        rows.forEach(r => { counts[r.slot] = { n: r.n, cap: r.cap }; if (r.n >= r.cap) taken.push(r.slot); });
      } else { throw new Error("no slot_counts"); }
    } catch (err) {
      try {
        const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/taken_slots`, { method: "POST", headers: hdr, body: JSON.stringify({ d: targetDate }) });
        const dbTaken = await res.json();
        if (Array.isArray(dbTaken)) dbTaken.forEach(s => { if (!taken.includes(s)) taken.push(s); });
      } catch (e2) {}
    }
  }

  if (reqId !== slotsRequestId || bookDate.value !== targetDate) return;
  document.querySelectorAll('input[name="timeSlot"]').forEach(inp => {
    const isTaken = taken.includes(inp.value);
    inp.disabled = isTaken;
    const label = inp.nextElementSibling;
    if (label) {
      if (isTaken) {
        label.classList.add("booked");
        label.innerHTML = `<span>${inp.value}</span><span class="slot-status-tag booked">محجوز ✕</span>`;
      } else {
        label.classList.remove("booked");
        const c = counts[inp.value];
        const left = c ? c.cap - c.n : null;
        label.innerHTML = `<span>${inp.value}</span><span class="slot-status-tag available">${left !== null && c.n > 0 ? `متبقي ${left} من ${c.cap}` : "متاح ✓"}</span>`;
      }
    }
    if (isTaken && inp.checked) inp.checked = false;
  });

  if (!document.querySelector('input[name="timeSlot"]:checked')) {
    const firstAvailable = document.querySelector('input[name="timeSlot"]:not(:disabled)');
    if (firstAvailable) firstAvailable.checked = true;
  }
  updateLiveSummary();
}
bookDate.addEventListener("input", fetchTakenSlots);
fetchTakenSlots();

function getSelectedPackage() {
  const checked = document.querySelector('input[name="pkg"]:checked');
  return checked ? checked.value : "regular";
}

function getSelectedCarSize() {
  const checked = document.querySelector('input[name="carSize"]:checked');
  return checked ? checked.value : "small";
}

function getSelectedPaymentMethod() {
  const checked = document.querySelector('input[name="payMethod"]:checked');
  return checked ? checked.value : "cash";
}

function getSelectedTimeSlot() {
  const checked = document.querySelector('input[name="timeSlot"]:checked');
  return checked ? checked.value : "";
}

function calculateCurrentPrice() {
  const pkgKey = getSelectedPackage();
  const sizeKey = getSelectedCarSize();
  return CONFIG.pricing[pkgKey][sizeKey];
}

function updateLiveSummary() {
  const pkgKey = getSelectedPackage();
  const sizeKey = getSelectedCarSize();
  const pkgData = CONFIG.pricing[pkgKey];
  const price = pkgData[sizeKey];
  const sizeData = CONFIG.carSizes[sizeKey];
  const payMethod = getSelectedPaymentMethod();
  const slot = getSelectedTimeSlot();

  $("priceTagSmall").textContent = `${pkgData.small} ر.س`;
  $("priceTagMedium").textContent = `${pkgData.medium} ر.س`;
  $("priceTagLarge").textContent = `${pkgData.large} ر.س`;

  $("inclusionsHeading").textContent = `مميزات ${pkgData.name} تشمل:`;
  $("inclusionsList").innerHTML = pkgData.features.map(f => `
    <li>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span>${f}</span>
    </li>
  `).join("");

  $("deepNote").style.display = pkgKey === "deep" ? "block" : "none";
  btnPriceTotal.textContent = price;

  recPkg.textContent = pkgData.name;
  recSize.textContent = `${sizeData.title} (${price} ر.س)`;
  recSlot.textContent = slot || "—";
  recPay.textContent = payMethod === "online" ? "دفع إلكتروني (أونلاين)" : payMethod === "transfer" ? "تحويل بنكي" : "الدفع عند الوصول";
  recTotal.textContent = price;
}

document.querySelectorAll('input[name="pkg"]').forEach(i => i.addEventListener("change", updateLiveSummary));
document.querySelectorAll('input[name="carSize"]').forEach(i => i.addEventListener("change", updateLiveSummary));
document.querySelectorAll('input[name="payMethod"]').forEach(i => i.addEventListener("change", updateLiveSummary));
updateLiveSummary();

window.selectPlanFromBottom = function(pkgKey) {
  const targetRadio = document.querySelector(`input[name="pkg"][value="${pkgKey}"]`);
  if (targetRadio) {
    targetRadio.checked = true;
    updateLiveSummary();
  }
};

function calcDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function isWithinDawadmi(lat, lng) {
  return calcDistanceKm(lat, lng, CONFIG.area.lat, CONFIG.area.lng) <= CONFIG.area.radiusKm;
}

function parseCoordinatesFromText(str) {
  if (!str) return null;
  const match = str.match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  return match ? { lat: parseFloat(match[1]), lng: parseFloat(match[2]) } : null;
}

$("geoBtn").addEventListener("click", () => {
  const statusEl = $("geoStatus");
  if (!navigator.geolocation) {
    statusEl.className = "gps-status err";
    statusEl.textContent = "متصفحك لا يدعم نظام GPS، اكتب اسم الحي أو الصق الرابط.";
    return;
  }
  statusEl.className = "gps-status loading";
  statusEl.textContent = "جاري تحديد موقعك بدقة...";

  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    currentCoordinates = { lat, lng };
    $("locationInput").value = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    
    if (isWithinDawadmi(lat, lng)) {
      statusEl.className = "gps-status ok";
      statusEl.textContent = "✓ تم تحديد موقعك بنجاح داخل الدوادمي";
    } else {
      statusEl.className = "gps-status err";
      statusEl.textContent = `⚠️ موقعك يبدو خارج نطاق تغطية ${CONFIG.area.name}. نحن نخدم الدوادمي وضواحيها.`;
    }
  }, () => {
    statusEl.className = "gps-status err";
    statusEl.textContent = "تعذر تحديد الموقع، يرجى تفعيل إذن الموقع أو كتابة اسم الحي.";
  }, { enableHighAccuracy: true, timeout: 10000 });
});

/* ========================================================
   توثيق البريد برمز OTP حقيقي (السيرفر يولّد الرمز ويرسله ويتحقق منه)
======================================================== */
const otpModal = $("otpModal");
const otpDigits = ["otp1", "otp2", "otp3", "otp4", "otp5", "otp6"];
let verifiedEmail = "";
let verifyToken = "";
let currentBookingId = null;
let otpSending = false;
let otpVerifying = false;
let bookingInFlight = false;

const fnUrl = name => `${CONFIG.supabaseUrl}/functions/v1/${name}`;
async function callFn(name, body) {
  const res = await fetch(fnUrl(name), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CONFIG.supabaseKey, ...(String(CONFIG.supabaseKey).startsWith("eyJ") ? { Authorization: `Bearer ${CONFIG.supabaseKey}` } : {}) },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "حدث خطأ، حاول مرة أخرى");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
const normEmail = e => String(e).trim().toLowerCase();
const normPhone = p => { let n = String(p).replace(/\D/g, ""); if (n.startsWith("00966")) n = n.slice(5); else if (n.startsWith("966")) n = n.slice(3); else if (n.startsWith("0")) n = n.slice(1); return n; };

otpDigits.forEach((id, idx) => {
  const el = $(id);
  el.addEventListener("input", () => {
    if (el.value.length === 1 && idx < otpDigits.length - 1) $(otpDigits[idx + 1]).focus();
  });
  el.addEventListener("keydown", e => {
    if (e.key === "Backspace" && !el.value && idx > 0) $(otpDigits[idx - 1]).focus();
  });
});
// لصق الرمز كاملاً (وتعبئة تلقائية من رسالة iOS/Android)
$("otp1").addEventListener("paste", e => {
  const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
  if (t.length > 1) { e.preventDefault(); otpDigits.forEach((id, i) => $(id).value = t[i] || ""); }
});
$("otp1").setAttribute("autocomplete", "one-time-code");

function clearOtpVerification() {
  verifiedEmail = "";
  verifyToken = "";
  $("phoneVerifiedStatus").style.display = "none";
}

function showResendNow(msg) {
  clearInterval(otpTimerInterval);
  $("otpCountdown").style.display = "none";
  $("resendOtpBtn").style.display = "inline";
  $("resendOtpBtn").disabled = false;
  if (msg) $("otpErrorAlert").textContent = msg;
}

function startOtpTimer() {
  let timeLeft = 60;
  clearInterval(otpTimerInterval);
  $("otpErrorAlert").textContent = "";
  $("otpCountdown").style.display = "inline";
  $("otpCountdown").textContent = `إعادة إرسال خلال ${timeLeft} ثانية`;
  $("resendOtpBtn").style.display = "none";
  $("resendOtpBtn").disabled = true;
  otpTimerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) { showResendNow(); return; }
    $("otpCountdown").textContent = `إعادة إرسال خلال ${timeLeft} ثانية`;
  }, 1000);
}

function resetOtpModal(clearVerification = true) {
  clearInterval(otpTimerInterval);
  otpDigits.forEach(id => $(id).value = "");
  $("otpErrorAlert").textContent = "";
  $("otpCountdown").style.display = "none";
  $("resendOtpBtn").style.display = "inline";
  $("resendOtpBtn").disabled = false;
  $("verifyAndConfirmBtn").disabled = false;
  if (clearVerification) clearOtpVerification();
}

function openOtpModal(email) {
  resetOtpModal(true);
  $("modalTargetPhone").textContent = email || "بريدك الإلكتروني";
  otpModal.classList.add("open");
  sendOtp();
  setTimeout(() => $("otp1").focus(), 150);
}

async function sendOtp() {
  if (otpSending) return;              // منع الإرسال المزدوج عند الضغط السريع
  otpSending = true;
  $("resendOtpBtn").disabled = true;
  $("otpErrorAlert").textContent = "";
  try {
    if (!currentBookingData || !currentBookingData.email) throw new Error("أدخل بريداً إلكترونياً صحيحاً أولاً.");
    await callFn("send-otp", { email: currentBookingData.email });
    startOtpTimer();
  } catch (err) {
    const msg = err.status === 429
      ? "محاولات كثيرة، انتظر قليلاً ثم اضغط إعادة الإرسال."
      : (err.message || "تعذر إرسال الرمز، حاول مرة أخرى.");
    showResendNow(msg);
  } finally {
    otpSending = false;
  }
}

$("resendOtpBtn").addEventListener("click", sendOtp);
$("closeOtpModal").addEventListener("click", () => {
  otpModal.classList.remove("open");
  resetOtpModal(true);
});
// إذا غيّر العميل بريده بعد التوثيق نطلب توثيقاً جديداً
$("custEmail").addEventListener("input", () => {
  if (normEmail($("custEmail").value) !== verifiedEmail) clearOtpVerification();
});

/* إرسال الفورم وطلب التحقق من البريد وحفظ الحجز */
form.addEventListener("submit", async e => {
  e.preventDefault();
  if (bookingInFlight) return;          // لا حجزين بنفس الضغط
  errorMsg.style.display = "none";
  errorMsg.textContent = "";

  const name = $("custName").value.trim();
  const phone = $("custPhone").value.trim();
  const email = $("custEmail").value.trim();
  const car = $("carDetails").value.trim();
  const locText = $("locationInput").value.trim();
  const dateVal = bookDate.value;
  const slotVal = getSelectedTimeSlot();
  const pkgKey = getSelectedPackage();
  const sizeKey = getSelectedCarSize();
  const payMethod = getSelectedPaymentMethod();
  const priceVal = calculateCurrentPrice();

  if (!dateVal) return showError("يرجى اختيار تاريخ الحجز.");
  if (!slotVal) return showError("يرجى اختيار وقت مناسب من الأوقات المتاحة.");
  if (!name) return showError("يرجى كتابة اسمك الكريم.");
  if (!phone || phone.length < 9) return showError("يرجى إدخال رقم جوال صحيح (مثال: 0533719216).");
  if (!locText) return showError("يرجى تحديد موقع السيارة (عبر زر GPS أو كتابة اسم الحي أو رابط الخريطة).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError("أدخل بريداً إلكترونياً صحيحاً لاستلام رمز التحقق والإيصال.");

  let parsedCoords = parseCoordinatesFromText(locText) || currentCoordinates;
  const pkgObj = CONFIG.pricing[pkgKey];
  const sizeObj = CONFIG.carSizes[sizeKey];

  currentBookingData = {
    id: Date.now(),
    name,
    phone,
    email: email,
    car: car || "غير محدد",
    packageKey: pkgKey,
    sizeKey,
    packageName: pkgObj.name,
    carSizeName: sizeObj.title,
    serviceTitle: `${pkgObj.name} - ${sizeObj.title}`,
    price: priceVal,
    date: dateVal,
    dateArabic: getArabicDayName(dateVal),
    slot: slotVal,
    pay: payMethod,
    locationText: locText,
    coords: parsedCoords,
    phone_verified: false,
    status: "new"
  };

  if (!isDbConfigured) return showError("الخدمة غير مفعلة بعد، تواصل معنا عبر الواتساب لإتمام الحجز.");

  // إذا لم يتم توثيق البريد بعد، أرسل الرمز وافتح نافذة الـ OTP
  if (!(verifyToken && verifiedEmail === normEmail(email))) {
    openOtpModal(email);
    return;
  }

  // تم التحقق بنجاح -> حفظ الحجز النهائي
  finalizeBookingProcess();
});

// تأكيد رمز التحقق المدخل وإرساله لدالة verify-otp ثم الحجز المباشر
$("verifyAndConfirmBtn").addEventListener("click", async () => {
  if (otpVerifying || bookingInFlight) return;
  const enteredCode = otpDigits.map(id => $(id).value).join("");
  if (enteredCode.length !== 6) {
    $("otpErrorAlert").textContent = "أدخل الرمز المكوّن من 6 أرقام.";
    return;
  }

  otpVerifying = true;
  $("verifyAndConfirmBtn").disabled = true;
  $("otpErrorAlert").textContent = "";

  try {
    const r = await callFn("verify-otp", { email: currentBookingData.email, code: enteredCode });
    if (!r.token || !(r.ok || r.valid || r.success)) {
      throw new Error(r.error || "رمز التحقق غير صحيح");
    }
    verifyToken = r.token;                       // توكن موقّع من السيرفر فقط
    verifiedEmail = normEmail(currentBookingData.email);
    $("phoneVerifiedStatus").style.display = "inline";
    otpModal.classList.remove("open");
    clearInterval(otpTimerInterval);
    await finalizeBookingProcess();
  } catch (err) {
    // فشل التحقق نفسه: أبقِ النافذة مفتوحة وامسح الحالة حتى لا يتكرر الإرسال بنفس التوكن
    clearOtpVerification();
    if (!otpModal.classList.contains("open")) otpModal.classList.add("open");
    $("otpErrorAlert").textContent = err.message || "رمز التحقق غير صحيح أو انتهت صلاحيته";
  } finally {
    otpVerifying = false;
    $("verifyAndConfirmBtn").disabled = false;
  }
});

async function finalizeBookingProcess() {
  if (bookingInFlight) return false;
  const d = currentBookingData;
  bookingInFlight = true;
  submitBtn.disabled = true;
  try {
    const c = d.coords || CONFIG.area;
    const r = await callFn("create-booking", {
      token: verifyToken, phone: d.phone, name: d.name, email: d.email,
      car: d.car, pkg: d.packageKey, size: d.sizeKey || getSelectedCarSize(), date: d.date, slot: d.slot,
      pay: d.pay, lat: c.lat, lng: c.lng, loc: d.locationText
    });
    d.id = r.id;
    d.bank = r.bank || null;   // بيانات التحويل تأتي من السيرفر بعد الحجز فقط
    d.price = r.price;          // السعر المعتمد من السيرفر
    d.phone_verified = true;
    currentBookingId = r.id;
  } catch (err) {
    const needOtp = err.status === 401 || /موثق|التحقق|توكن|verified/i.test(err.message || "");
    clearOtpVerification();
    showError(err.message || "تعذر حفظ الحجز، يرجى المحاولة مرة أخرى.");
    fetchTakenSlots();
    if (needOtp && d && d.email) setTimeout(() => openOtpModal(d.email), 120);
    return false;
  } finally {
    bookingInFlight = false;
    submitBtn.disabled = false;
  }

  // نجاح الحجز: لا تُعد حالة التحقق مستخدمَة في محاولة تالية
  clearOtpVerification();

  saveLocalSlot(d.date, d.slot, d.name);
  try {
    const raw = localStorage.getItem("qs_local_bookings_master");
    const master = raw ? JSON.parse(raw) : [];
    master.push(d);
    localStorage.setItem("qs_local_bookings_master", JSON.stringify(master));
  } catch (e) {}

  fetchTakenSlots();
  showSuccessScreen(d);
  return true;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
  errorMsg.scrollIntoView({ behavior: "smooth", block: "center" });
}

function generateWhatsAppUrl(data, ratingInfo) {
  let waMessage = 
`*طلب حجز جديد موثق - ${CONFIG.brandName}* ✨
-----------------------------
🔒 *الحالة:* بريد موثق برمز OTP ✓
👤 *الاسم:* ${data.name}
📱 *رقم الجوال:* ${data.phone}
📧 *الإيميل:* ${data.email || '—'}
🧼 *الباقة:* ${data.packageName}
🚗 *حجم السيارة:* ${data.carSizeName}
🚘 *بيانات السيارة:* ${data.car}
📅 *اليوم والتاريخ:* ${data.dateArabic}
⏰ *الوقت المفضل:* ${data.slot} (فترة ساعة كاملة)
📍 *الموقع:* ${data.locationText}
💳 *طريقة الدفع:* ${payLabel(data.pay)}
💰 *الإجمالي:* ${data.price} ${CONFIG.currency}`;

  if (ratingInfo) {
    waMessage += `
-----------------------------
⭐ *تقييم وانطباع العميل:* ${ratingInfo.rating}/5 نجوم
💬 *التعليق:* ${ratingInfo.comment || 'خدمة ممتازة'}`;
  }

  waMessage += `
-----------------------------
أرجو تأكيد الموعد، شكراً لكم!`;
  return `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(waMessage)}`;
}

function showSuccessScreen(data) {
  form.style.display = "none";
  $("successScreen").style.display = "block";

  $("successReceiptDetails").innerHTML = `
    <div style="font-size:1.05rem;font-weight:900;margin-bottom:12px;color:var(--primary);border-bottom:1px solid var(--border);padding-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
      <span>تفاصيل الفاتورة والموعد</span>
      <span style="font-size:0.75rem;background:#dcfce7;color:#166534;padding:2px 8px;border-radius:999px;">✓ بريد موثق OTP</span>
    </div>
    <div style="display:grid;gap:8px;font-size:0.92rem;">
      <div><b>الاسم:</b> ${escapeHtml(data.name)}</div>
      <div><b>الجوال:</b> ${escapeHtml(data.phone)}</div>
      <div><b>الخدمة:</b> ${escapeHtml(data.packageName)} (${escapeHtml(data.carSizeName)})</div>
      <div><b>السيارة:</b> ${escapeHtml(data.car)}</div>
      <div><b>الموعد:</b> ${escapeHtml(data.dateArabic)} · ${escapeHtml(data.slot)} (مدة ساعة كاملة)</div>
      <div><b>الموقع:</b> ${escapeHtml(data.locationText)}</div>
      <div><b>طريقة الدفع:</b> ${payLabel(data.pay)}</div>
      <div style="font-weight:900;color:var(--primary);font-size:1.15rem;margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);">
        <b>المبلغ الإجمالي:</b> ${data.price} ${CONFIG.currency}
      </div>
    </div>
  `;

  $("sendWaBtn").href = generateWhatsAppUrl(data, null);

  showPaymentSection(data);

  chosenPostRating = 5;
  setStarsHighlight($("postBookingStars"), 5);
  updateRatingLabel(5);
  chosenSelectedTags = [];
  document.querySelectorAll("#quickTagsContainer .rating-tag-chip").forEach(t => t.classList.remove("selected"));
  $("feedbackComment").value = "";
  $("ratingSuccessMsg").style.display = "none";
  $("submitFeedbackBtn").disabled = false;
  $("submitFeedbackBtn").style.display = "block";

  $("successScreen").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* التقييم بعد الحجز */
let chosenPostRating = 5;
let chosenSelectedTags = [];

const ratingLabels = {
  5: "ممتاز جداً 🌟 (5 نجوم)",
  4: "جيد جداً 👍 (4 نجوم)",
  3: "جيد (3 نجوم)",
  2: "مقبول (نجمتان)",
  1: "يحتاج تحسين (نجمة واحدة)"
};

function updateRatingLabel(val) {
  $("starLabel").textContent = ratingLabels[val] || "";
}

function setStarsHighlight(container, val) {
  const buttons = container.querySelectorAll(".star-btn");
  buttons.forEach(btn => {
    const starVal = parseInt(btn.dataset.val, 10);
    btn.classList.toggle("active", starVal <= val);
  });
}

$("postBookingStars").addEventListener("click", e => {
  const btn = e.target.closest(".star-btn");
  if (!btn) return;
  chosenPostRating = parseInt(btn.dataset.val, 10);
  setStarsHighlight($("postBookingStars"), chosenPostRating);
  updateRatingLabel(chosenPostRating);
});

$("quickTagsContainer").addEventListener("click", e => {
  const chip = e.target.closest(".rating-tag-chip");
  if (!chip) return;
  chip.classList.toggle("selected");
  const tag = chip.dataset.tag;
  if (chip.classList.contains("selected")) {
    if (!chosenSelectedTags.includes(tag)) chosenSelectedTags.push(tag);
  } else {
    chosenSelectedTags = chosenSelectedTags.filter(t => t !== tag);
  }
});

$("submitFeedbackBtn").addEventListener("click", async () => {
  const comment = $("feedbackComment").value.trim();
  const userName = currentBookingData ? currentBookingData.name : "عميل قصة الغسيل";
  const pkg = currentBookingData ? currentBookingData.packageKey : "regular";

  const newReview = {
    id: Date.now(),
    name: userName,
    district: "مدينة الدوادمي",
    rating: chosenPostRating,
    package: pkg,
    tags: [...chosenSelectedTags],
    comment: comment || "",
    date: "اليوم"
  };

  saveReview(newReview);

  if (currentBookingData) {
    $("sendWaBtn").href = generateWhatsAppUrl(currentBookingData, {
      rating: chosenPostRating,
      comment: newReview.comment
    });
  }

  $("ratingSuccessMsg").style.display = "block";
  $("submitFeedbackBtn").style.display = "none";
});

/* تقييمات العملاء: حقيقية فقط، من قاعدة البيانات وبعد موافقة الإدارة */
let REVIEWS_CACHE = [];
function getStoredReviews() { return REVIEWS_CACHE; }

async function loadReviews() {
  if (!isDbConfigured) { REVIEWS_CACHE = []; renderAllReviews(); return; }
  try {
    const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/reviews?select=name,rating,package,tags,comment,district,created_at&status=eq.approved&order=created_at.desc&limit=60`,
      { headers: { apikey: CONFIG.supabaseKey, ...(String(CONFIG.supabaseKey).startsWith("eyJ") ? { Authorization: `Bearer ${CONFIG.supabaseKey}` } : {}) } });
    const rows = r.ok ? await r.json() : [];
    REVIEWS_CACHE = rows.map(x => ({
      name: x.name, rating: x.rating, package: x.package, comment: x.comment || "", district: x.district,
      tags: x.tags ? String(x.tags).split(", ").filter(Boolean) : [],
      date: new Date(x.created_at).toLocaleDateString("ar-SA-u-ca-gregory")
    }));
  } catch (e) { REVIEWS_CACHE = []; }
  renderAllReviews();
}

// التقييم الجديد يُحفظ بحالة "قيد المراجعة" ولا يظهر للزوار إلا بعد موافقة الأدمن
function saveReview(reviewObj) {
  if (!isDbConfigured) return;
  fetch(`${CONFIG.supabaseUrl}/rest/v1/reviews`, {
    method: "POST",
    headers: { apikey: CONFIG.supabaseKey, ...(String(CONFIG.supabaseKey).startsWith("eyJ") ? { Authorization: `Bearer ${CONFIG.supabaseKey}` } : {}), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      name: reviewObj.name, rating: reviewObj.rating, package: reviewObj.package,
      tags: (reviewObj.tags || []).join(", "), comment: reviewObj.comment || "",
      district: reviewObj.district || "الدوادمي", status: "pending"
    })
  }).catch(() => {});
}

let currentReviewFilter = "all";

function renderAllReviews() {
  const list = getStoredReviews();
  const filtered = currentReviewFilter === "all" ? list : list.filter(r => r.package === currentReviewFilter);

  if (!list.length) {
    $("avgRatingDisplay").textContent = "—";
    $("starsHeader").textContent = "☆☆☆☆☆";
    $("reviewsSummaryText").textContent = "لا توجد تقييمات منشورة بعد. كن أول من يقيّم خدمتنا.";
    $("reviewsGrid").innerHTML = "";
    return;
  }
  const avg = (list.reduce((a, r) => a + (r.rating || 0), 0) / list.length).toFixed(1);
  $("avgRatingDisplay").textContent = avg;
  $("starsHeader").textContent = "★".repeat(Math.round(avg)) + "☆".repeat(5 - Math.round(avg));
  $("reviewsSummaryText").textContent = `متوسط التقييم بناءً على ${list.length} تقييم من عملائنا`;

  $("reviewsGrid").innerHTML = filtered.map(r => {
    const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
    const initial = r.name ? r.name.trim().charAt(0) : "ع";
    const pkgLabel = r.package === "deep" ? "باقة الغسيل العميق" : "باقة الغسيل العادي";

    return `
      <div class="review-item-card">
        <div>
          <div class="rev-user-row">
            <div class="rev-avatar-meta">
              <div class="rev-avatar">${initial}</div>
              <div>
                <div class="rev-name">
                  <span>${escapeHtml(r.name)}</span>
                </div>
                <div class="rev-meta">${escapeHtml(r.district || 'الدوادمي')} · ${escapeHtml(r.date || 'مؤخراً')}</div>
              </div>
            </div>
            <div class="rev-stars">${stars}</div>
          </div>
          ${r.comment ? `<p class="rev-comment">"${escapeHtml(r.comment)}"</p>` : ""}
        </div>
        <div>
          <div class="rev-tags-row">
            <span class="rev-tag-badge">${pkgLabel}</span>
            ${(r.tags || []).map(t => `<span class="rev-tag-badge">${escapeHtml(t)}</span>`).join("")}
          </div>
        </div>
      </div>
    `;
  }).join("");
}
renderAllReviews();
loadReviews();

document.querySelectorAll(".rev-filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".rev-filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentReviewFilter = btn.dataset.filter;
    renderAllReviews();
  });
});

/* مودال استعلام العميل عن حجوزاته */
const trackModal = $("trackModal");
$("openTrackModalBtn").addEventListener("click", () => trackModal.classList.add("open"));
$("closeTrackModal").addEventListener("click", () => trackModal.classList.remove("open"));

$("searchMyBookingsBtn").addEventListener("click", async () => {
  const phone = $("trackPhoneInput").value.trim().replace(/\D/g, "");
  if (!phone || phone.length < 9) {
    alert("يرجى إدخال رقم جوالك كاملاً.");
    return;
  }

  const statusTags = {
    new: { label: "قيد المراجعة", color: "#f59e0b" },
    confirmed: { label: "مؤكد", color: "#0284c7" },
    in_progress: { label: "الفريق في الطريق 🚗", color: "#8b5cf6" },
    done: { label: "تم الإنجاز ⭐", color: "#10b981" },
    cancelled: { label: "ملغي", color: "#ef4444" }
  };

  // الحالة الحقيقية من قاعدة البيانات (وليس من نسخة المتصفح فقط)
  let rows = [];
  if (isDbConfigured) {
    try {
      const hdr = {
        apikey: CONFIG.supabaseKey,
        "Content-Type": "application/json",
        ...(String(CONFIG.supabaseKey).startsWith("eyJ") ? { Authorization: `Bearer ${CONFIG.supabaseKey}` } : {})
      };
      const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/lookup_my_bookings`, {
        method: "POST", headers: hdr, body: JSON.stringify({ p_phone: phone })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) rows = data;
      }
    } catch (e) {}
  }

  if (!rows.length) {
    let all = [];
    try {
      const raw = localStorage.getItem("qs_local_bookings_master");
      if (raw) all = JSON.parse(raw);
    } catch (e) {}
    rows = all.filter(b => String(b.phone || "").replace(/\D/g, "").includes(phone.slice(-9)))
      .map(b => ({
        service: b.serviceTitle || b.packageName || "غسيل سيارة", price: b.price,
        date: b.date, dateArabic: b.dateArabic, slot: b.slot, car: b.car, status: b.status
      }));
  }

  if (!rows.length) {
    $("myBookingsResultBox").innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.9rem;">
        لا توجد حجوزات مسجلة بهذا الرقم حالياً.
      </div>
    `;
    return;
  }

  $("myBookingsResultBox").innerHTML = rows.map(b => {
    const st = statusTags[b.status] || statusTags.new;
    return `
      <div style="background:var(--page-bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <b style="color:var(--primary);font-size:0.95rem;">${escapeHtml(b.service || 'غسيل سيارة')}</b>
          <span style="font-size:0.75rem;font-weight:800;color:#fff;background:${st.color};padding:2px 8px;border-radius:999px;">${st.label}</span>
        </div>
        <div style="font-size:0.85rem;color:var(--text-muted);">
          الموعد: <b>${escapeHtml(b.dateArabic || getArabicDayName(b.date) || b.date || '—')} · ${escapeHtml(b.slot || '')}</b>
        </div>
        <div style="font-size:0.85rem;color:var(--text-muted);">
          السيارة: <b>${escapeHtml(b.car || '—')}</b> · المبلغ: <b>${b.price ?? '—'} ر.س</b>
        </div>
      </div>
    `;
  }).join("");
});


/* باقي النوافذ */
const reviewModal = $("reviewModal");
let modalChosenStars = 5;

$("openReviewModalBtn").addEventListener("click", () => {
  reviewModal.classList.add("open");
  modalChosenStars = 5;
  setStarsHighlight($("modalStarsWrap"), 5);
});
$("closeReviewModal").addEventListener("click", () => reviewModal.classList.remove("open"));

$("modalStarsWrap").addEventListener("click", e => {
  const btn = e.target.closest(".star-btn");
  if (!btn) return;
  modalChosenStars = parseInt(btn.dataset.val, 10);
  setStarsHighlight($("modalStarsWrap"), modalChosenStars);
});

$("standaloneReviewForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("modalRevName").value.trim();
  const district = $("modalRevDistrict").value.trim() || "الدوادمي";
  const pkg = $("modalRevPackage").value;
  const comment = $("modalRevComment").value.trim();

  const newReview = {
    id: Date.now(),
    name,
    district,
    rating: modalChosenStars,
    package: pkg,
    tags: ["⭐ تجربة موثقة"],
    comment,
    date: "اليوم"
  };

  saveReview(newReview);
  reviewModal.classList.remove("open");
  alert("شكراً لك! وصل تقييمك وسيظهر بعد مراجعة الإدارة.");
  $("standaloneReviewForm").reset();
});

$("editBookingBtn").addEventListener("click", () => {
  $("successScreen").style.display = "none";
  form.style.display = "block";
});

const payLabel = p => p === "online" ? "دفع إلكتروني (Apple Pay / مدى / فيزا)" : p === "transfer" ? "تحويل بنكي" : "الدفع عند الوصول (كاش/شبكة)";

function showPaymentSection(data) {
  const bank = $("bankTransferBox"), online = $("onlinePayBox");
  bank.classList.remove("show"); online.style.display = "none";
  if (data.pay === "transfer") {
    const b = data.bank || {};
    window.__bankIban = b.iban || "";
    $("bankHolder").textContent = b.holder || "تواصل معنا عبر الواتساب للحصول على بيانات التحويل";
    $("bankName").textContent = b.name || "—";
    $("bankIban").textContent = b.iban || "—";
    $("bankAmount").textContent = `${data.price} ${CONFIG.currency}`;
    $("bankRef").textContent = `#${data.id}`;
    bank.classList.add("show");
  } else if (data.pay === "online") {
    online.style.display = "block";
    mountMoyasar(data);
  }
}

$("copyIbanBtn").addEventListener("click", () => {
  if (!window.__bankIban) return;
  navigator.clipboard.writeText(window.__bankIban.replace(/\s/g, "")).then(() => {
    $("copyIbanBtn").textContent = "تم النسخ ✓";
    setTimeout(() => $("copyIbanBtn").textContent = "نسخ الآيبان", 2000);
  });
});

// نموذج الدفع الجاهز من Moyasar (Apple Pay + مدى + بطاقات). المبلغ بالهللة.
function mountMoyasar(data) {
  if (!CONFIG.moyasarPublishableKey || typeof Moyasar === "undefined") {
    $("moyasarForm").innerHTML = '<p style="font-size:.85rem;color:#b45309">الدفع الإلكتروني غير متاح حالياً، اختر التحويل البنكي أو الدفع عند الوصول.</p>';
    return;
  }
  $("moyasarForm").innerHTML = "";
  Moyasar.init({
    element: "#moyasarForm",
    amount: data.price * 100,
    currency: "SAR",
    description: `حجز #${data.id} - ${data.packageName}`,
    publishable_api_key: CONFIG.moyasarPublishableKey,
    callback_url: `${location.origin}${location.pathname}?booking=${data.id}`,
    metadata: { booking_id: String(data.id) },
    methods: ["applepay", "creditcard"],
    supported_networks: ["mada", "visa", "mastercard"],
    apple_pay: {
      country: "SA",
      label: CONFIG.brandName,
      validate_merchant_url: "https://api.moyasar.com/v1/applepay/initiate"
    }
  });
}

// العميل رجع من صفحة 3DS: تأكد من السيرفر أن الدفع تم فعلاً
(async function handlePaymentReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.get("id") || !q.get("booking") || !isDbConfigured) return;
  try {
    const r = await callFn("confirm-payment", { payment_id: q.get("id"), booking_id: q.get("booking") });
    alert(r.ok ? "تم الدفع بنجاح ✓ وتم تأكيد حجزك. شكراً لك!" : "لم تكتمل عملية الدفع. تواصل معنا عبر الواتساب إذا خُصم المبلغ.");
  } catch (e) { alert("تعذر التحقق من الدفع، تواصل معنا عبر الواتساب."); }
  history.replaceState({}, "", location.pathname);
})();

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}

const themeToggle = $("themeToggle");
const currentTheme = localStorage.getItem("qs_theme") || "light";
if (currentTheme === "dark") {
  document.documentElement.setAttribute("data-theme", "dark");
}

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("qs_theme", newTheme);
});

// الدفع الإلكتروني (Apple Pay / مدى) يظهر فقط بعد إضافة مفتاح Moyasar في config.js
if (!CONFIG.moyasarPublishableKey) {
  const onlineRadio = document.querySelector('input[name="payMethod"][value="online"]');
  if (onlineRadio) onlineRadio.closest("label").style.display = "none";
}
