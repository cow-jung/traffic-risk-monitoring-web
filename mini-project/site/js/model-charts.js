/* 발표 자료의 동일 test 371장 평가값. 차트는 표의 보조 시각화입니다. */
(function () {
  'use strict';
  var chartInstances = [];
  var fallback = document.getElementById('chart-unavailable');

  function render() {
    chartInstances.forEach(function (chart) { chart.destroy(); });
    chartInstances = [];
    if (typeof Chart === 'undefined') {
      fallback.hidden = false;
      return;
    }
    fallback.hidden = true;
    var light = document.documentElement.dataset.theme === 'light';
    var text = light ? '#304658' : '#c3cdd6';
    var grid = light ? 'rgba(23,38,51,.12)' : 'rgba(195,205,214,.16)';
    var shared = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: text, boxWidth: 12 } }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { ticks: { color: text }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: text }, grid: { color: grid } }
      }
    };
    chartInstances.push(new Chart(document.getElementById('model-metrics-chart'), {
      type: 'bar',
      data: {
        labels: ['팀 88', 'Alope 121', 'Alope 151', 'Alope 181'],
        datasets: [
          { label: '전체 mAP50', data: [.805, .796, .798, .792], backgroundColor: '#ffb020' },
          { label: '목재 재현율', data: [.489, .505, .541, .491], backgroundColor: '#36b9cf' }
        ]
      },
      options: Object.assign({}, shared, { scales: {
        x: shared.scales.x,
        y: Object.assign({}, shared.scales.y, { max: 1, ticks: { color: text, stepSize: .2 } })
      } })
    }));
    chartInstances.push(new Chart(document.getElementById('threshold-chart'), {
      type: 'bar',
      data: {
        labels: ['0.20', '0.25', '0.30', '0.40', '0.50'],
        datasets: [
          { label: '오탐 (건)', data: [209, 151, 115, 65, 36], backgroundColor: '#ffb020' },
          { label: '미탐 (건)', data: [185, 192, 200, 229, 255], backgroundColor: light ? '#bd4860' : '#ff6a80' }
        ]
      },
      options: shared
    }));
  }

  render();
  new MutationObserver(function (mutations) {
    if (mutations.some(function (mutation) { return mutation.attributeName === 'data-theme'; })) render();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
