import { viewMount } from './ui.js';
import { getSupabase } from '../supabaseClient.js';

async function chartDataStatus() {
  const supabase = getSupabase();
  const statuses = ['Triagem','Aguardando Aceite','Rejeitada','Em Analise','Em Andamento','Aguardando o Cliente','Em Teste','Resolvido'];
  const results = await Promise.all(statuses.map(s => supabase.from('pendencias').select('*', { count: 'exact', head: true }).eq('status', s)));
  return statuses.map((s, i) => ({ label: s, value: results[i].count ?? 0 }));
}

async function chartDataPrioridade() {
  const supabase = getSupabase();
  const prios = ['Critica','Alta','Media','Baixa'];
  const results = await Promise.all(prios.map(p => supabase.from('pendencias').select('*', { count: 'exact', head: true }).eq('prioridade', p)));
  return prios.map((p, i) => ({ label: p, value: results[i].count ?? 0 }));
}

export async function render() {
  const v = viewMount();
  v.innerHTML = `
    <div class="grid">
      <div class="col-6 card">
        <h3>Por Status</h3>
        <canvas id="cStatus" height="200"></canvas>
      </div>
      <div class="col-6 card">
        <h3>Por Prioridade</h3>
        <canvas id="cPrioridade" height="200"></canvas>
      </div>
      <div class="col-12 card">
        <h3>Por Técnico (Top 10)</h3>
        <canvas id="cTecnico" height="240"></canvas>
      </div>
    </div>
  `;

  const status = await chartDataStatus();
  const prios = await chartDataPrioridade();

  const supabase = getSupabase();
  const { data: tecnicos } = await supabase
    .from('pendencia_triagem')
    .select('tecnico_responsavel, count:tecnico_responsavel', { count: 'exact' })
    .not('tecnico_responsavel', 'is', null)
    .order('count', { ascending: false })
    .limit(10);

  // Usar build ESM do Chart.js para funcionar com import() em browsers
  const Chart = (await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/auto/+esm')).default;
  const textColor = (getComputedStyle(document.documentElement).getPropertyValue('--text') || '#111827').trim();

  new Chart(document.getElementById('cStatus'), {
    type: 'doughnut', data: { labels: status.map(x => x.label), datasets: [{ data: status.map(x => x.value), backgroundColor: ['#6b7280','#f59e0b','#ef4444','#1976D2','#3b82f6','#fbbf24','#A78BFA','var(--color-success)'] }] }, options: { plugins: { legend: { labels: { color: textColor } } } }
  });

  new Chart(document.getElementById('cPrioridade'), {
    type: 'bar', data: { labels: prios.map(x => x.label), datasets: [{ data: prios.map(x => x.value), backgroundColor: ['#ef4444','#f59e0b','#3b82f6','#6b7280'] }] }, options: { scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } } }
  });

  const labelsT = (tecnicos || []).map(t => t.tecnico_responsavel);
  const valuesT = (tecnicos || []).map(t => t.count);
  new Chart(document.getElementById('cTecnico'), {
    type: 'line', data: { labels: labelsT, datasets: [{ data: valuesT, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.2)', tension: 0.3 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: textColor } }, y: { ticks: { color: textColor } } } }
  });
}
