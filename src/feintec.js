// =============================================================
// feintec.js — marca a Feintec como "acontecendo" nos dias do evento
// -------------------------------------------------------------
// De 3 a 5 de novembro de 2026 (horário de Brasília) a página mostra
// o selo "Acontecendo agora" no topo e destaca a Feintec na linha do
// tempo. Depois do dia 5 a Feintec aparece como concluída.
// Para testar: abra a página com ?data=2026-11-04
// =============================================================

const INICIO = '2026-11-03';
const FIM = '2026-11-05';

/** Data de hoje (AAAA-MM-DD) no fuso de Brasília, independente do aparelho. */
function hojeEmBrasilia() {
  const teste = new URLSearchParams(location.search).get('data');
  if (teste && /^\d{4}-\d{2}-\d{2}$/.test(teste)) return teste;
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function marcarFeintec() {
  const hoje = hojeEmBrasilia();
  const item = document.getElementById('tl-feintec');
  const status = document.getElementById('tl-feintec-st');
  const selo = document.getElementById('aovivo');
  if (!item || !status) return;

  // datas no formato AAAA-MM-DD podem ser comparadas como texto
  if (hoje >= INICIO && hoje <= FIM) {
    item.classList.add('tl--live');
    status.textContent = 'acontecendo agora · 3 a 5 de novembro';
    if (selo) selo.hidden = false;
    document.title = 'Ao vivo na Feintec · Robô Ecológico';
  } else if (hoje > FIM) {
    item.classList.add('tl--ok');
    status.textContent = 'concluída · 3 a 5 de novembro de 2026';
  }
}
