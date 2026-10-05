// Loads prep cards and handles two-tap capture on the Today page.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function loadPrep(el) {
  try {
    const res = await fetch(`/api/prep/${el.dataset.prep}`);
    if (!res.ok) throw new Error(res.status);
    const { focus, questions } = await res.json();
    el.querySelector('.prep-body').innerHTML =
      `<p class="focus">${esc(focus)}</p><ol>${questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>`;
  } catch {
    el.querySelector('.prep-body').innerHTML = '<p class="muted">Couldn\'t load questions. Refresh to try again.</p>';
  }
}

async function save(box, fields) {
  const status = box.querySelector('.saved');
  status.textContent = 'Saving…';
  const res = await fetch(`/api/capture/${box.dataset.capture}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) { status.textContent = 'Not saved, try again'; return; }
  const c = await res.json();
  const done = Boolean(c.rating && c.next_step);
  box.classList.toggle('done', done);
  status.textContent = done ? 'Captured' : 'Saved';
}

document.addEventListener('DOMContentLoaded', () => {
  // Opening a prep card is what counts as "using" a moment, so load each one as it scrolls into view.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      loadPrep(e.target);
    }
  }, { rootMargin: '200px' });
  document.querySelectorAll('[data-prep]').forEach((el) => io.observe(el));

  document.querySelectorAll('[data-capture]').forEach((box) => {
    box.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button.tap');
      if (btn) {
        btn.parentElement.querySelectorAll('.tap').forEach((b) => b.classList.toggle('on', b === btn));
        save(box, { [btn.dataset.field]: btn.dataset.value });
      }
      if (ev.target.closest('.save-note')) {
        save(box, { note: box.querySelector('textarea').value });
      }
    });
  });
});
