// حماية خفيفة ضد الفضول (لا تمنع المطّلعين فعلياً). لإلغائها احذف سطر guard.js من الصفحات.
(function () {
  var isField = function (t) { return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  // منع القائمة اليمنى (مع إبقائها داخل حقول الكتابة للّصق والنسخ)
  document.addEventListener("contextmenu", function (e) { if (!isField(e.target)) e.preventDefault(); });
  // منع اختصارات فتح أدوات المطور وعرض المصدر
  document.addEventListener("keydown", function (e) {
    var ctrl = e.ctrlKey || e.metaKey, c = e.code;
    var devKeys = (c === "KeyI" || c === "KeyJ" || c === "KeyC");
    if (e.key === "F12" ||
        (ctrl && e.shiftKey && devKeys) ||
        (ctrl && !e.shiftKey && !e.altKey && c === "KeyU") ||
        (e.metaKey && e.altKey && (devKeys || c === "KeyU"))) {
      e.preventDefault(); e.stopPropagation();
    }
  }, true);
  document.addEventListener("dragstart", function (e) { if (e.target && e.target.tagName === "IMG") e.preventDefault(); });
})();

// ---- كشف فتح أدوات المطور: تظهر شاشة تغطي الصفحة وتختفي تلقائياً عند إغلاقها ----
(function () {
  // وضع "الجوال" داخل أدوات المطور يقلّد جهازاً صغيراً، فلا نعتمد عليه في الاستثناء.
  // فحص الحجم يُطبق على الشاشات الكبيرة فقط (لتجنب الإنذار الكاذب على الجوال)،
  // أما فحص التوقف (debugger) فلا يؤثر إطلاقاً على أي زائر عادي فيعمل في كل الأجهزة.
  var small = (navigator.maxTouchPoints || 0) > 0 && Math.min(screen.width, screen.height) < 900;

  var overlay = null, locked = false;
  function show(on, msg) {
    if (on) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.setAttribute("style", "position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:#0b1220;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;font-family:Arial,sans-serif;padding:24px;font-size:1.1rem");
      }
      overlay.innerHTML = '<div dir="rtl">' + (msg || "أدوات المطور مفتوحة.<br>أغلقها لمتابعة استخدام الموقع.") + '</div>';
      if (!overlay.parentNode) document.documentElement.appendChild(overlay);
    } else if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }
  // قفل نهائي: يمسح محتوى الصفحة ولا يرجع إلا بتحديث الصفحة بعد إغلاق الأدوات.
  // يُستخدم فقط عند اكتشاف التوقف (debugger) لأنه لا يعطي إنذاراً كاذباً أبداً.
  function hardLock() {
    locked = true;
    try { document.body.innerHTML = ""; } catch (e) {}
    show(true, "تم إيقاف الصفحة لأن أدوات المطور مفتوحة.<br>أغلقها ثم حدّث الصفحة.");
  }

  // كائن يستشعر قراءة وحدة التحكم له (Chrome/Edge)
  var touched = false;
  var probe = new Error();
  Object.defineProperty(probe, "stack", { get: function () { touched = true; return ""; } });
  var trap = new Function("debugger;");

  function check() {
    var bySize = !small && ((window.outerWidth - window.innerWidth > 200) || (window.outerHeight - window.innerHeight > 260));

    // عبارة debugger لا تفعل شيئاً عند الزائر العادي، لكن إذا كانت الأدوات مفتوحة توقف الصفحة،
    // فيطول الزمن المقاس ونعرف أنها مفتوحة (ويعمل حتى في وضع الجوال أو الأدوات المنفصلة)
    var t0 = performance.now();
    trap();
    var byPause = performance.now() - t0 > 100;

    if (byPause) { hardLock(); return; }
    if (locked) return;

    touched = false;
    try { console.log(probe); console.clear(); } catch (e) {}
    show(bySize || touched);
  }
  setInterval(check, 1000);
})();
