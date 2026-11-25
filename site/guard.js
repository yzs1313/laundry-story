// منع فتح أدوات المطوّر بالاختصارات الشائعة وقائمة النقر الأيمن.
// ملاحظة: قائمة المتصفح (الثلاث نقاط) جزء من المتصفح ولا يمكن حظرها من صفحة الويب.
(function () {
  function isDevtoolsShortcut(e) {
    const key = String(e.key || "").toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;

    if (key === "f12") return true;
    if (ctrl && e.shiftKey && ["i", "j", "c", "k"].includes(key)) return true;
    if (ctrl && !e.shiftKey && key === "u") return true;
    if (e.metaKey && e.altKey && ["i", "j", "c"].includes(key)) return true;
    return false;
  }

  function block(e) {
    if (!isDevtoolsShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  window.addEventListener("keydown", block, true);
  document.addEventListener("keydown", block, true);
  document.addEventListener("contextmenu", e => e.preventDefault(), false);
})();
