export function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

export function metaDescription(intention, query) {
  const clean = String(intention).replace(/[.!?]+$/, '');
  const text = `Intenção real: ${clean}. Veja 5 buscas melhores para "${query}" e onde encontrar respostas.`;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}...` : text;
}
