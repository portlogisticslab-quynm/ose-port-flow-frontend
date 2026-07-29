"use strict";

// ============================================================
// STATE
// ============================================================

const state = {
  result: null,

  flow: {
    ready: false,
    playing: false,
    time: 0,
    dtMin: 0.05,
    maximumTime: 0,
    requestId: null,
    previousTimestamp: null
  },

  series: {
    ready: false,
    playing: false,
    time: 0,
    dtMin: 0.05,
    data: null,
    requestId: null,
    previousTimestamp: null
  }
};

const charts = {
  wait: null,
  utilization: null,
  histogram: null,
  timeSeries: null
};

const markerPlugin = {
  id: "verticalTimeMarker",

  afterDatasetsDraw(chart, args, options) {
    if (
      !options ||
      !Number.isFinite(options.value)
    ) {
      return;
    }

    const scale = chart.scales.x;
    const area = chart.chartArea;

    if (!scale || !area) {
      return;
    }

    const x = scale.getPixelForValue(options.value);
    const context = chart.ctx;

    context.save();
    context.beginPath();
    context.moveTo(x, area.top);
    context.lineTo(x, area.bottom);
    context.strokeStyle = "rgba(15,23,42,0.75)";
    context.lineWidth = 1.4;
    context.setLineDash([6, 4]);
    context.stroke();
    context.restore();
  }
};

Chart.register(markerPlugin);

// ============================================================
// DOM
// ============================================================

const simulationHours =
  document.getElementById("simulationHours");

const arrivalRate =
  document.getElementById("arrivalRate");

const seedInput =
  document.getElementById("seedInput");

const stage1Servers =
  document.getElementById("stage1Servers");

const stage1Rate =
  document.getElementById("stage1Rate");

const stage2Servers =
  document.getElementById("stage2Servers");

const stage2Rate =
  document.getElementById("stage2Rate");

const stage3Servers =
  document.getElementById("stage3Servers");

const stage3Rate =
  document.getElementById("stage3Rate");

const runButton =
  document.getElementById("runButton");

const exportButton =
  document.getElementById("exportButton");

const openTimeSeriesButton =
  document.getElementById("openTimeSeriesButton");

const statusBox =
  document.getElementById("status");

const backendBadge =
  document.getElementById("backendBadge");

const summaryBody =
  document.querySelector("#summaryTable tbody");

const managementNote =
  document.getElementById("managementNote");

const histogramStageSelect =
  document.getElementById("histogramStageSelect");

const refreshHistogramButton =
  document.getElementById("refreshHistogramButton");

const flowPlayButton =
  document.getElementById("flowPlayButton");

const flowResetButton =
  document.getElementById("flowResetButton");

const flowStepButton =
  document.getElementById("flowStepButton");

const flowSpeed =
  document.getElementById("flowSpeed");

const flowSpeedValue =
  document.getElementById("flowSpeedValue");

const flowInfo =
  document.getElementById("flowInfo");

const flowCanvas =
  document.getElementById("flowCanvas");

const flowContext =
  flowCanvas.getContext("2d");

const timeSeriesView =
  document.getElementById("timeSeriesView");

const seriesPlayButton =
  document.getElementById("seriesPlayButton");

const seriesResetButton =
  document.getElementById("seriesResetButton");

const seriesStepButton =
  document.getElementById("seriesStepButton");

const seriesSpeed =
  document.getElementById("seriesSpeed");

const seriesSpeedValue =
  document.getElementById("seriesSpeedValue");

const seriesInfo =
  document.getElementById("seriesInfo");

// ============================================================
// TABS
// ============================================================

document
  .querySelectorAll(".tab-button")
  .forEach(button => {
    button.addEventListener("click", () => {
      openTab(button.dataset.tab);
    });
  });

function openTab(tabId) {
  document
    .querySelectorAll(".tab-button")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tabId
      );
    });

  document
    .querySelectorAll(".tab-content")
    .forEach(content => {
      content.classList.toggle(
        "active",
        content.id === tabId
      );
    });
}

openTimeSeriesButton.addEventListener(
  "click",
  () => openTab("timeSeriesTab")
);

// ============================================================
// STATUS
// ============================================================

function setStatus(message, type = "") {
  statusBox.textContent = `Status: ${message}`;
  statusBox.className = `status ${type}`;
}

// ============================================================
// INPUTS
// ============================================================

function parseInputs() {
  const simHours = Number(simulationHours.value);
  const lambda = Number(arrivalRate.value);

  const stages = [
    {
      name: "Stage 1: Crane",
      shortName: "Crane",
      servers: Number(stage1Servers.value),
      rate: Number(stage1Rate.value)
    },
    {
      name: "Stage 2: Forklift/AGV",
      shortName: "Forklift/AGV",
      servers: Number(stage2Servers.value),
      rate: Number(stage2Rate.value)
    },
    {
      name: "Stage 3: Dock",
      shortName: "Dock",
      servers: Number(stage3Servers.value),
      rate: Number(stage3Rate.value)
    }
  ];

  if (
    !Number.isFinite(simHours) ||
    !Number.isFinite(lambda) ||
    simHours <= 0 ||
    lambda <= 0
  ) {
    throw new Error(
      "Simulation time and arrival rate must be positive."
    );
  }

  for (const stage of stages) {
    if (
      !Number.isInteger(stage.servers) ||
      stage.servers < 1 ||
      !Number.isFinite(stage.rate) ||
      stage.rate <= 0
    ) {
      throw new Error(
        "Every stage must have an integer number of servers ≥ 1 and a positive service rate."
      );
    }
  }

  return {
    simHours,
    lambda,
    stages,
    seedText: seedInput.value
  };
}

// ============================================================
// RUN
// ============================================================

runButton.addEventListener("click", async () => {
  try {
    stopFlowAnimation();
    stopSeriesAnimation();

    runButton.disabled = true;
    setStatus("Running simulation on the server...");

    const inputs = parseInputs();

    const response = await fetch(
      `${window.PORTFLOW_API_BASE}/api/simulate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(inputs)
      }
    );

    let payload = null;

    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(
        `Backend returned HTTP ${response.status} without valid JSON.`
      );
    }

    if (!response.ok) {
      const detail =
        typeof payload.detail === "string"
          ? payload.detail
          : JSON.stringify(payload.detail || payload);

      throw new Error(detail || `Backend error HTTP ${response.status}.`);
    }

    state.result = payload;

    updateSummary();
    updateCharts();
    updateHistogram();
    initializeFlowAnimation();
    initializeTimeSeriesAnimation();

    exportButton.disabled = false;
    openTimeSeriesButton.disabled = false;
    histogramStageSelect.disabled = false;
    refreshHistogramButton.disabled = false;

    setStatus(
      `Done. ${payload.N} arrivals; ${payload.completed} completed within the horizon.`,
      "success"
    );

    openTab("chartsTab");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    runButton.disabled = false;
  }
});

// ============================================================
// SUMMARY
// ============================================================

function updateSummary() {
  const result = state.result;

  summaryBody.innerHTML = "";

  result.inputs.stages.forEach(
    (stageInput, index) => {
      const row =
        document.createElement("tr");

      row.innerHTML = `
        <td>${stageInput.name}</td>
        <td>${stageInput.servers}</td>
        <td>${formatNumber(stageInput.rate)}</td>
        <td>${formatNumber(result.avgWaitMinutes[index])}</td>
        <td>${formatNumber(result.p95WaitMinutes[index])}</td>
        <td>${result.maxQueue[index]}</td>
        <td>${formatNumber(result.utilizationPercent[index])}%</td>
        <td>${formatNumber(result.throughputPerHour)}</td>
      `;

      summaryBody.appendChild(row);
    }
  );

  const maximumAverageWait =
    Math.max(...result.avgWaitMinutes);

  const scores =
    result.utilizationPercent.map(
      (utilization, index) =>
        0.6 * utilization / 100 +
        0.4 *
        result.avgWaitMinutes[index] /
        Math.max(
          maximumAverageWait,
          Number.EPSILON
        )
    );

  const bottleneckIndex =
    indexOfMaximum(scores);

  const bottleneckName =
    result.inputs.stages[
      bottleneckIndex
    ].shortName;

  managementNote.textContent =
`Arrivals = ${result.N} (${formatNumber(result.inputs.lambda)}/h)
Completed within horizon = ${result.completed} (${formatNumber(result.throughputPerHour)}/h)

Bottleneck: ${bottleneckName}
Utilization = ${formatNumber(result.utilizationPercent[bottleneckIndex])}%
Average waiting time = ${formatNumber(result.avgWaitMinutes[bottleneckIndex])} min
P95 waiting time = ${formatNumber(result.p95WaitMinutes[bottleneckIndex])} min
Maximum queue = ${result.maxQueue[bottleneckIndex]}`;
}

function indexOfMaximum(values) {
  let index = 0;

  for (let item = 1;
       item < values.length;
       item++) {
    if (values[item] > values[index]) {
      index = item;
    }
  }

  return index;
}

// ============================================================
// CHARTS
// ============================================================

function destroyChart(name) {
  if (charts[name]) {
    charts[name].destroy();
    charts[name] = null;
  }
}

function updateCharts() {
  updateWaitChart();
  updateUtilizationChart();
}

function updateWaitChart() {
  destroyChart("wait");

  charts.wait = new Chart(
    document.getElementById("waitChart"),
    {
      type: "bar",

      data: {
        labels: [
          "Crane",
          "Forklift/AGV",
          "Dock"
        ],

        datasets: [
          {
            label: "Average",
            data:
              state.result.avgWaitMinutes
          },
          {
            label: "P95",
            data:
              state.result.p95WaitMinutes
          }
        ]
      },

      options: basicChartOptions(
        "Stage",
        "Waiting time (min)"
      )
    }
  );
}

function updateUtilizationChart() {
  destroyChart("utilization");

  charts.utilization = new Chart(
    document.getElementById("utilizationChart"),
    {
      type: "bar",

      data: {
        labels: [
          "Crane",
          "Forklift/AGV",
          "Dock"
        ],

        datasets: [{
          label: "Utilization",
          data:
            state.result.utilizationPercent
        }]
      },

      options: basicChartOptions(
        "Stage",
        "Utilization (%)"
      )
    }
  );
}

function basicChartOptions(
  xLabel,
  yLabel
) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,

    scales: {
      x: {
        title: {
          display: true,
          text: xLabel
        }
      },

      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: yLabel
        }
      }
    }
  };
}

// ============================================================
// HISTOGRAM
// ============================================================

histogramStageSelect.addEventListener(
  "change",
  updateHistogram
);

refreshHistogramButton.addEventListener(
  "click",
  updateHistogram
);

function updateHistogram() {
  if (!state.result) {
    return;
  }

  destroyChart("histogram");

  const selection =
    histogramStageSelect.value;

  const waitSeries = [
    state.result.stage1.waitTime.map(
      value => value * 60
    ),
    state.result.stage2.waitTime.map(
      value => value * 60
    ),
    state.result.stage3.waitTime.map(
      value => value * 60
    )
  ];

  const labels = [
    "Stage 1 – Crane",
    "Stage 2 – Forklift/AGV",
    "Stage 3 – Dock"
  ];

  const selectedIndices =
    selection === "all"
      ? [0, 1, 2]
      : [
          {
            stage1: 0,
            stage2: 1,
            stage3: 2
          }[selection]
        ];

  const allValues =
    selectedIndices.flatMap(
      index => waitSeries[index]
    );

  let minimum = Math.min(...allValues);
  let maximum = Math.max(...allValues);

  if (minimum === maximum) {
    minimum -= 0.5;
    maximum += 0.5;
  }

  const binCount = 25;
  const binWidth =
    (maximum - minimum) / binCount;

  const centers = Array.from(
    { length: binCount },
    (_, index) =>
      minimum +
      (index + 0.5) *
      binWidth
  );

  const datasets =
    selectedIndices.map(index => {
      const counts =
        histogramCounts(
          waitSeries[index],
          minimum,
          maximum,
          binCount
        );

      return {
        type: "line",
        label: labels[index],
        data: centers.map(
          (x, binIndex) => ({
            x,
            y: counts[binIndex]
          })
        ),
        stepped: "middle",
        pointRadius: 0,
        borderWidth: 2
      };
    });

  charts.histogram = new Chart(
    document.getElementById("histogramChart"),
    {
      type: "scatter",
      data: { datasets },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,

        scales: {
          x: {
            type: "linear",
            title: {
              display: true,
              text: "Waiting time (min)"
            }
          },

          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Number of containers"
            },
            ticks: {
              precision: 0
            }
          }
        }
      }
    }
  );
}

function histogramCounts(
  values,
  minimum,
  maximum,
  binCount
) {
  const counts =
    new Array(binCount).fill(0);

  const width =
    (maximum - minimum) / binCount;

  for (const value of values) {
    let index =
      Math.floor(
        (value - minimum) / width
      );

    index = Math.max(
      0,
      Math.min(
        binCount - 1,
        index
      )
    );

    counts[index]++;
  }

  return counts;
}

// ============================================================
// FLOW ANIMATION
// ============================================================

function initializeFlowAnimation() {
  stopFlowAnimation();

  const maximumTime =
    Math.max(
      state.result.inputs.simHours * 60,
      ...state.result.stage3.endService.map(
        value => value * 60
      )
    );

  state.flow.ready = true;
  state.flow.time = 0;
  state.flow.maximumTime = maximumTime;
  state.flow.dtMin = Math.max(
    0.05,
    Math.min(
      0.5,
      maximumTime / 900
    )
  );

  flowPlayButton.disabled = false;
  flowResetButton.disabled = false;
  flowStepButton.disabled = false;
  flowSpeed.disabled = false;

  renderFlow(0);
}

flowPlayButton.addEventListener(
  "click",
  () => {
    if (!state.flow.ready) {
      return;
    }

    state.flow.playing =
      !state.flow.playing;

    flowPlayButton.textContent =
      state.flow.playing
        ? "Pause"
        : "Play";

    state.flow.previousTimestamp = null;

    if (state.flow.playing) {
      state.flow.requestId =
        requestAnimationFrame(
          flowAnimationLoop
        );
    }
  }
);

flowResetButton.addEventListener(
  "click",
  () => {
    stopFlowAnimation();

    state.flow.time = 0;
    renderFlow(0);
  }
);

flowStepButton.addEventListener(
  "click",
  () => {
    stopFlowAnimation();

    const increment =
      state.flow.dtMin *
      Number(flowSpeed.value);

    state.flow.time = Math.min(
      state.flow.maximumTime,
      state.flow.time + increment
    );

    renderFlow(state.flow.time);
  }
);

flowSpeed.addEventListener(
  "input",
  () => {
    flowSpeedValue.textContent =
      `${Number(flowSpeed.value).toFixed(2)}×`;
  }
);

function stopFlowAnimation() {
  state.flow.playing = false;
  state.flow.previousTimestamp = null;

  if (state.flow.requestId) {
    cancelAnimationFrame(
      state.flow.requestId
    );

    state.flow.requestId = null;
  }

  flowPlayButton.textContent = "Play";
}

function flowAnimationLoop(timestamp) {
  if (!state.flow.playing) {
    return;
  }

  if (
    state.flow.previousTimestamp === null
  ) {
    state.flow.previousTimestamp =
      timestamp;
  }

  const elapsed =
    timestamp -
    state.flow.previousTimestamp;

  state.flow.previousTimestamp =
    timestamp;

  state.flow.time +=
    elapsed / 30 *
    state.flow.dtMin *
    Number(flowSpeed.value);

  if (
    state.flow.time >=
    state.flow.maximumTime
  ) {
    state.flow.time =
      state.flow.maximumTime;

    state.flow.playing = false;
    flowPlayButton.textContent = "Play";
  }

  renderFlow(state.flow.time);

  if (state.flow.playing) {
    state.flow.requestId =
      requestAnimationFrame(
        flowAnimationLoop
      );
  }
}

function renderFlow(timeMinutes) {
  const context = flowContext;
  const width = flowCanvas.width;
  const height = flowCanvas.height;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const entry = {
    x: 35,
    y: 225,
    w: 115,
    h: 100
  };

  const stage1 = {
    x: 235,
    y: 175,
    w: 190,
    h: 200
  };

  const stage2 = {
    x: 590,
    y: 175,
    w: 190,
    h: 200
  };

  const stage3 = {
    x: 945,
    y: 175,
    w: 190,
    h: 200
  };

  const exit = {
    x: 1240,
    y: 225,
    w: 120,
    h: 100
  };

  drawFlowBox(
    context,
    entry,
    "Entry",
    "#eef2ff"
  );

  drawFlowBox(
    context,
    stage1,
    "Stage 1",
    "#eff6ff",
    "Crane"
  );

  drawFlowBox(
    context,
    stage2,
    "Stage 2",
    "#ecfdf3",
    "Forklift/AGV"
  );

  drawFlowBox(
    context,
    stage3,
    "Stage 3",
    "#fff7ed",
    "Dock"
  );

  drawFlowBox(
    context,
    exit,
    "Exit",
    "#f1f5f9"
  );

  drawArrow(
    context,
    entry.x + entry.w,
    entry.y + entry.h / 2,
    stage1.x,
    stage1.y + stage1.h / 2
  );

  drawArrow(
    context,
    stage1.x + stage1.w,
    stage1.y + stage1.h / 2,
    stage2.x,
    stage2.y + stage2.h / 2
  );

  drawArrow(
    context,
    stage2.x + stage2.w,
    stage2.y + stage2.h / 2,
    stage3.x,
    stage3.y + stage3.h / 2
  );

  drawArrow(
    context,
    stage3.x + stage3.w,
    stage3.y + stage3.h / 2,
    exit.x,
    exit.y + exit.h / 2
  );

  drawServerIndicators(
    context,
    stage1,
    state.result.inputs.stages[0].servers
  );

  drawServerIndicators(
    context,
    stage2,
    state.result.inputs.stages[1].servers
  );

  drawServerIndicators(
    context,
    stage3,
    state.result.inputs.stages[2].servers
  );

  const maxShow =
    Math.min(
      state.result.N,
      120
    );

  const counts = {
    entryQueue: 0,
    stage1: 0,
    inter12: 0,
    stage2: 0,
    inter23: 0,
    stage3: 0,
    completed: 0
  };

  const queueOrders = {
    entry: [],
    inter12: [],
    inter23: []
  };

  for (let index = 0;
       index < maxShow;
       index++) {
    const arrival =
      state.result.arrivals[index] * 60;

    const s1Start =
      state.result.stage1.startService[index] * 60;

    const s1End =
      state.result.stage1.endService[index] * 60;

    const s2Start =
      state.result.stage2.startService[index] * 60;

    const s2End =
      state.result.stage2.endService[index] * 60;

    const s3Start =
      state.result.stage3.startService[index] * 60;

    const s3End =
      state.result.stage3.endService[index] * 60;

    if (
      arrival <= timeMinutes &&
      timeMinutes < s1Start
    ) {
      queueOrders.entry.push(index);
    } else if (
      s1End <= timeMinutes &&
      timeMinutes < s2Start
    ) {
      queueOrders.inter12.push(index);
    } else if (
      s2End <= timeMinutes &&
      timeMinutes < s3Start
    ) {
      queueOrders.inter23.push(index);
    }
  }

  for (let index = 0;
       index < maxShow;
       index++) {
    const arrival =
      state.result.arrivals[index] * 60;

    const s1Start =
      state.result.stage1.startService[index] * 60;

    const s1End =
      state.result.stage1.endService[index] * 60;

    const s2Start =
      state.result.stage2.startService[index] * 60;

    const s2End =
      state.result.stage2.endService[index] * 60;

    const s3Start =
      state.result.stage3.startService[index] * 60;

    const s3End =
      state.result.stage3.endService[index] * 60;

    if (timeMinutes < arrival) {
      continue;
    }

    let position;
    let color;

    if (timeMinutes < s1Start) {
      counts.entryQueue++;

      position = queuePosition(
        queueOrders.entry.indexOf(index),
        {
          x: 160,
          y: 190,
          w: 65,
          h: 165
        }
      );

      color = "#f59e0b";
    } else if (timeMinutes < s1End) {
      counts.stage1++;

      position = serverPosition(
        state.result.stage1.serverId[index],
        state.result.inputs.stages[0].servers,
        stage1
      );

      color = "#3b82f6";
    } else if (timeMinutes < s2Start) {
      counts.inter12++;

      position = queuePosition(
        queueOrders.inter12.indexOf(index),
        {
          x: 440,
          y: 190,
          w: 135,
          h: 165
        }
      );

      color = "#f59e0b";
    } else if (timeMinutes < s2End) {
      counts.stage2++;

      position = serverPosition(
        state.result.stage2.serverId[index],
        state.result.inputs.stages[1].servers,
        stage2
      );

      color = "#22c55e";
    } else if (timeMinutes < s3Start) {
      counts.inter23++;

      position = queuePosition(
        queueOrders.inter23.indexOf(index),
        {
          x: 795,
          y: 190,
          w: 135,
          h: 165
        }
      );

      color = "#f59e0b";
    } else if (timeMinutes < s3End) {
      counts.stage3++;

      position = serverPosition(
        state.result.stage3.serverId[index],
        state.result.inputs.stages[2].servers,
        stage3
      );

      color = "#ef4444";
    } else {
      counts.completed++;

      position = {
        x: exit.x + exit.w / 2,
        y: exit.y + exit.h / 2
      };

      color = "#64748b";
    }

    drawContainerDot(
      context,
      position.x,
      position.y,
      color,
      index + 1
    );
  }

  context.fillStyle = "#0f172a";
  context.font = "bold 17px Arial";
  context.textAlign = "right";

  const lines = [
    `Time: ${formatNumber(timeMinutes)} min`,
    `Entry queue: ${counts.entryQueue}`,
    `At crane: ${counts.stage1}`,
    `Queue to Stage 2: ${counts.inter12}`,
    `At forklift/AGV: ${counts.stage2}`,
    `Queue to Stage 3: ${counts.inter23}`,
    `At dock: ${counts.stage3}`,
    `Completed: ${counts.completed}`
  ];

  let y = 28;

  for (const line of lines) {
    context.fillText(
      line,
      width - 20,
      y
    );

    y += 23;
  }

  flowInfo.textContent =
    `dt=${formatNumber(state.flow.dtMin)} | t=${formatNumber(timeMinutes)} min`;
}

function drawFlowBox(
  context,
  box,
  title,
  fillColor,
  subtitle = ""
) {
  context.fillStyle = fillColor;
  context.strokeStyle = "#64748b";
  context.lineWidth = 2;

  context.fillRect(
    box.x,
    box.y,
    box.w,
    box.h
  );

  context.strokeRect(
    box.x,
    box.y,
    box.w,
    box.h
  );

  context.fillStyle = "#0f172a";
  context.textAlign = "center";
  context.font = "bold 18px Arial";

  context.fillText(
    title,
    box.x + box.w / 2,
    box.y - 15
  );

  if (subtitle) {
    context.font = "14px Arial";

    context.fillText(
      subtitle,
      box.x + box.w / 2,
      box.y + box.h + 24
    );
  }
}

function drawArrow(
  context,
  x1,
  y1,
  x2,
  y2
) {
  const angle =
    Math.atan2(
      y2 - y1,
      x2 - x1
    );

  const head = 11;

  context.strokeStyle = "#64748b";
  context.fillStyle = "#64748b";
  context.lineWidth = 2;

  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();

  context.beginPath();
  context.moveTo(x2, y2);

  context.lineTo(
    x2 -
      head *
      Math.cos(
        angle - Math.PI / 6
      ),
    y2 -
      head *
      Math.sin(
        angle - Math.PI / 6
      )
  );

  context.lineTo(
    x2 -
      head *
      Math.cos(
        angle + Math.PI / 6
      ),
    y2 -
      head *
      Math.sin(
        angle + Math.PI / 6
      )
  );

  context.closePath();
  context.fill();
}

function drawServerIndicators(
  context,
  box,
  serverCount
) {
  for (let index = 0;
       index < serverCount;
       index++) {
    const position =
      serverPosition(
        index + 1,
        serverCount,
        box
      );

    context.fillStyle = "#ffffff";
    context.strokeStyle = "#475569";
    context.lineWidth = 1.2;

    context.beginPath();
    context.arc(
      position.x,
      position.y,
      23,
      0,
      Math.PI * 2
    );
    context.fill();
    context.stroke();

    context.fillStyle = "#334155";
    context.font = "bold 12px Arial";
    context.textAlign = "center";

    context.fillText(
      `S${index + 1}`,
      position.x,
      position.y + 4
    );
  }
}

function serverPosition(
  serverId,
  serverCount,
  box
) {
  const index = serverId - 1;

  const y =
    serverCount === 1
      ? box.y + box.h / 2
      : box.y +
        35 +
        index *
        (box.h - 70) /
        (serverCount - 1);

  return {
    x: box.x + box.w / 2,
    y
  };
}

function queuePosition(
  index,
  box
) {
  const safeIndex =
    Math.max(index, 0);

  const columns = 6;
  const column =
    safeIndex % columns;

  const row =
    Math.floor(
      safeIndex / columns
    );

  const xSpacing =
    box.w /
    Math.max(
      columns,
      1
    );

  return {
    x:
      box.x +
      box.w -
      8 -
      column * xSpacing,
    y:
      box.y +
      18 +
      row * 19
  };
}

function drawContainerDot(
  context,
  x,
  y,
  color,
  id
) {
  context.fillStyle = color;
  context.strokeStyle = "#334155";
  context.lineWidth = 1;

  context.beginPath();
  context.arc(
    x,
    y,
    7,
    0,
    Math.PI * 2
  );
  context.fill();
  context.stroke();

  if (id <= 35) {
    context.fillStyle = "#0f172a";
    context.font = "8px Arial";
    context.textAlign = "center";

    context.fillText(
      String(id),
      x,
      y - 10
    );
  }
}

// ============================================================
// TIME-SERIES ANIMATION
// ============================================================

function initializeTimeSeriesAnimation() {
  stopSeriesAnimation();

  timeSeriesView.disabled = false;
  seriesPlayButton.disabled = false;
  seriesResetButton.disabled = false;
  seriesStepButton.disabled = false;
  seriesSpeed.disabled = false;

  state.series.ready = true;
  state.series.time = 0;

  rebuildTimeSeries();
}

timeSeriesView.addEventListener(
  "change",
  () => {
    stopSeriesAnimation();
    state.series.time = 0;
    rebuildTimeSeries();
  }
);

seriesPlayButton.addEventListener(
  "click",
  () => {
    if (!state.series.ready) {
      return;
    }

    state.series.playing =
      !state.series.playing;

    seriesPlayButton.textContent =
      state.series.playing
        ? "Pause"
        : "Play";

    state.series.previousTimestamp = null;

    if (state.series.playing) {
      state.series.requestId =
        requestAnimationFrame(
          seriesAnimationLoop
        );
    }
  }
);

seriesResetButton.addEventListener(
  "click",
  () => {
    stopSeriesAnimation();

    state.series.time = 0;
    updateSeriesMarker(0);
  }
);

seriesStepButton.addEventListener(
  "click",
  () => {
    stopSeriesAnimation();

    const increment =
      state.series.dtMin *
      Number(seriesSpeed.value);

    const maximum =
      state.series.data.time[
        state.series.data.time.length - 1
      ];

    state.series.time = Math.min(
      maximum,
      state.series.time + increment
    );

    updateSeriesMarker(
      state.series.time
    );
  }
);

seriesSpeed.addEventListener(
  "input",
  () => {
    seriesSpeedValue.textContent =
      `${Number(seriesSpeed.value).toFixed(2)}×`;
  }
);

function stopSeriesAnimation() {
  state.series.playing = false;
  state.series.previousTimestamp = null;

  if (state.series.requestId) {
    cancelAnimationFrame(
      state.series.requestId
    );

    state.series.requestId = null;
  }

  seriesPlayButton.textContent = "Play";
}

function seriesAnimationLoop(timestamp) {
  if (!state.series.playing) {
    return;
  }

  if (
    state.series.previousTimestamp === null
  ) {
    state.series.previousTimestamp =
      timestamp;
  }

  const elapsed =
    timestamp -
    state.series.previousTimestamp;

  state.series.previousTimestamp =
    timestamp;

  state.series.time +=
    elapsed / 30 *
    state.series.dtMin *
    Number(seriesSpeed.value);

  const maximum =
    state.series.data.time[
      state.series.data.time.length - 1
    ];

  if (state.series.time >= maximum) {
    state.series.time = maximum;
    state.series.playing = false;
    seriesPlayButton.textContent = "Play";
  }

  updateSeriesMarker(
    state.series.time
  );

  if (state.series.playing) {
    state.series.requestId =
      requestAnimationFrame(
        seriesAnimationLoop
      );
  }
}

function rebuildTimeSeries() {
  state.series.data =
    buildSeriesForView(
      timeSeriesView.value
    );

  state.series.dtMin =
    state.series.data.dtMin;

  destroyChart("timeSeries");

  charts.timeSeries = new Chart(
    document.getElementById("timeSeriesChart"),
    {
      type: "line",

      data: {
        datasets: [
          createLineSeries(
            "Arrived",
            state.series.data.time,
            state.series.data.arrived
          ),
          createLineSeries(
            "In queue",
            state.series.data.time,
            state.series.data.inQueue
          ),
          createLineSeries(
            "In service",
            state.series.data.time,
            state.series.data.inService
          ),
          createLineSeries(
            "Departed",
            state.series.data.time,
            state.series.data.departed
          ),
          createMarkerDataset("Arrived marker"),
          createMarkerDataset("Queue marker"),
          createMarkerDataset("Service marker"),
          createMarkerDataset("Departed marker")
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,

        plugins: {
          verticalTimeMarker: {
            value: 0
          }
        },

        scales: {
          x: {
            type: "linear",
            title: {
              display: true,
              text: "Time (min)"
            }
          },

          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Number of containers"
            },
            ticks: {
              precision: 0
            }
          }
        }
      }
    }
  );

  updateSeriesMarker(0);
}

function buildSeriesForView(view) {
  const result = state.result;
  const simMinutes =
    result.inputs.simHours * 60;

  let label;
  let arrivals;
  let starts;
  let ends;

  if (view === "stage1") {
    label = "Stage 1 – Crane";
    arrivals =
      result.arrivals.map(
        value => value * 60
      );
    starts =
      result.stage1.startService.map(
        value => value * 60
      );
    ends =
      result.stage1.endService.map(
        value => value * 60
      );
  } else if (view === "stage2") {
    label = "Stage 2 – Forklift/AGV";
    arrivals =
      result.stage1.endService.map(
        value => value * 60
      );
    starts =
      result.stage2.startService.map(
        value => value * 60
      );
    ends =
      result.stage2.endService.map(
        value => value * 60
      );
  } else if (view === "stage3") {
    label = "Stage 3 – Dock";
    arrivals =
      result.stage2.endService.map(
        value => value * 60
      );
    starts =
      result.stage3.startService.map(
        value => value * 60
      );
    ends =
      result.stage3.endService.map(
        value => value * 60
      );
  } else {
    return buildOverallSeries();
  }

  const maximum = Math.max(
    simMinutes,
    ...arrivals,
    ...starts,
    ...ends
  );

  const grid =
    createTimeGrid(maximum);

  const arrived =
    cumulativeCounts(
      arrivals,
      grid.time
    );

  const started =
    cumulativeCounts(
      starts,
      grid.time
    );

  const departed =
    cumulativeCounts(
      ends,
      grid.time
    );

  const inService =
    started.map(
      (value, index) =>
        value - departed[index]
    );

  const inQueue =
    arrived.map(
      (value, index) =>
        Math.max(
          0,
          value -
          departed[index] -
          inService[index]
        )
    );

  return {
    label,
    dtMin: grid.dtMin,
    time: grid.time,
    arrived,
    inQueue,
    inService,
    departed
  };
}

function buildOverallSeries() {
  const result = state.result;

  const arrivals =
    result.arrivals.map(
      value => value * 60
    );

  const departures =
    result.stage3.endService.map(
      value => value * 60
    );

  const maximum = Math.max(
    result.inputs.simHours * 60,
    ...arrivals,
    ...departures
  );

  const grid =
    createTimeGrid(maximum);

  const arrived =
    cumulativeCounts(
      arrivals,
      grid.time
    );

  const departed =
    cumulativeCounts(
      departures,
      grid.time
    );

  const s1Started =
    cumulativeCounts(
      result.stage1.startService.map(
        value => value * 60
      ),
      grid.time
    );

  const s1Ended =
    cumulativeCounts(
      result.stage1.endService.map(
        value => value * 60
      ),
      grid.time
    );

  const s2Started =
    cumulativeCounts(
      result.stage2.startService.map(
        value => value * 60
      ),
      grid.time
    );

  const s2Ended =
    cumulativeCounts(
      result.stage2.endService.map(
        value => value * 60
      ),
      grid.time
    );

  const s3Started =
    cumulativeCounts(
      result.stage3.startService.map(
        value => value * 60
      ),
      grid.time
    );

  const s3Ended =
    cumulativeCounts(
      result.stage3.endService.map(
        value => value * 60
      ),
      grid.time
    );

  const inService =
    grid.time.map(
      (_, index) =>
        s1Started[index] -
        s1Ended[index] +
        s2Started[index] -
        s2Ended[index] +
        s3Started[index] -
        s3Ended[index]
    );

  const inQueue =
    arrived.map(
      (value, index) =>
        Math.max(
          0,
          value -
          departed[index] -
          inService[index]
        )
    );

  return {
    label: "Overall system",
    dtMin: grid.dtMin,
    time: grid.time,
    arrived,
    inQueue,
    inService,
    departed
  };
}

function createTimeGrid(maximum) {
  const safeMaximum =
    Math.max(0.1, maximum);

  const dtMin = Math.max(
    0.02,
    Math.min(
      0.5,
      safeMaximum / 1200
    )
  );

  const time = [];

  for (
    let value = 0;
    value <= safeMaximum + dtMin / 2;
    value += dtMin
  ) {
    time.push(value);
  }

  return {
    dtMin,
    time
  };
}

function cumulativeCounts(
  eventTimes,
  grid
) {
  const sorted =
    [...eventTimes].sort(
      (a, b) => a - b
    );

  const counts =
    new Array(grid.length).fill(0);

  let eventIndex = 0;

  for (let index = 0;
       index < grid.length;
       index++) {
    while (
      eventIndex < sorted.length &&
      sorted[eventIndex] <= grid[index]
    ) {
      eventIndex++;
    }

    counts[index] = eventIndex;
  }

  return counts;
}

function createLineSeries(
  label,
  time,
  values
) {
  return {
    label,
    data: time.map(
      (x, index) => ({
        x,
        y: values[index]
      })
    ),
    pointRadius: 0,
    borderWidth: 1.8,
    tension: 0
  };
}

function createMarkerDataset(label) {
  return {
    type: "scatter",
    label,
    data: [{
      x: 0,
      y: 0
    }],
    pointRadius: 5,
    showLine: false
  };
}

function updateSeriesMarker(time) {
  if (!charts.timeSeries) {
    return;
  }

  const data = state.series.data;

  const markerValues = [
    previousAtTime(
      data.time,
      data.arrived,
      time
    ),
    previousAtTime(
      data.time,
      data.inQueue,
      time
    ),
    previousAtTime(
      data.time,
      data.inService,
      time
    ),
    previousAtTime(
      data.time,
      data.departed,
      time
    )
  ];

  for (let index = 0;
       index < 4;
       index++) {
    charts.timeSeries
      .data
      .datasets[index + 4]
      .data = [{
        x: time,
        y: markerValues[index]
      }];
  }

  charts.timeSeries
    .options
    .plugins
    .verticalTimeMarker
    .value = time;

  charts.timeSeries.update("none");

  seriesInfo.textContent =
    `${data.label} | dt=${formatNumber(data.dtMin)} | t=${formatNumber(time)} min`;
}

function previousAtTime(
  time,
  values,
  target
) {
  let low = 0;
  let high = time.length - 1;

  while (low <= high) {
    const middle =
      Math.floor((low + high) / 2);

    if (time[middle] <= target) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return values[
    Math.max(0, high)
  ];
}

// ============================================================
// CSV EXPORT
// ============================================================

exportButton.addEventListener(
  "click",
  exportCsvLogs
);

async function exportCsvLogs() {
  try {
    if (!state.result) {
      throw new Error(
        "Run the simulation before exporting."
      );
    }

    if (typeof JSZip === "undefined") {
      throw new Error(
        "The ZIP export library could not be loaded."
      );
    }

    const zip = new JSZip();

    zip.file(
      "stage1_crane_log.csv",
      buildStageCsv(
        state.result.arrivals,
        state.result.stage1
      )
    );

    zip.file(
      "stage2_forklift_log.csv",
      buildStageCsv(
        state.result.stage1.endService,
        state.result.stage2
      )
    );

    zip.file(
      "stage3_dock_log.csv",
      buildStageCsv(
        state.result.stage2.endService,
        state.result.stage3
      )
    );

    zip.file(
      "summary_meta.csv",
      buildSummaryCsv()
    );

    const blob =
      await zip.generateAsync({
        type: "blob"
      });

    downloadBlob(
      blob,
      `port_flow_logs_${timestamp()}.zip`
    );

    setStatus(
      "CSV logs exported in a ZIP archive.",
      "success"
    );
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function buildStageCsv(
  arrivalTimes,
  stage
) {
  const headers = [
    "JobID",
    "Arrival_hr",
    "Start_hr",
    "End_hr",
    "Wait_min",
    "ServerID"
  ];

  const rows =
    stage.startService.map(
      (start, index) => [
        index + 1,
        arrivalTimes[index],
        start,
        stage.endService[index],
        (
          start -
          arrivalTimes[index]
        ) * 60,
        stage.serverId[index]
      ]
    );

  return rowsToCsv(headers, rows);
}

function buildSummaryCsv() {
  const result = state.result;

  const lines = [
    [
      "SIM_HOURS",
      "lambda",
      "N",
      "total_completed",
      "throughput_per_hour"
    ],
    [
      result.inputs.simHours,
      result.inputs.lambda,
      result.N,
      result.completed,
      result.throughputPerHour
    ],
    [],
    [
      "Stage",
      "Servers",
      "RatePerServer",
      "AvgWaitMin",
      "P95WaitMin",
      "MaxQ",
      "UtilPct"
    ]
  ];

  result.inputs.stages.forEach(
    (stageInput, index) => {
      lines.push([
        stageInput.shortName,
        stageInput.servers,
        stageInput.rate,
        result.avgWaitMinutes[index],
        result.p95WaitMinutes[index],
        result.maxQueue[index],
        result.utilizationPercent[index]
      ]);
    }
  );

  return lines
    .map(
      row =>
        row.map(csvEscape).join(",")
    )
    .join("\n");
}

function rowsToCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map(
      row =>
        row.map(csvEscape).join(",")
    )
  ].join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function downloadBlob(
  blob,
  fileName
) {
  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

// ============================================================
// GENERIC HELPERS
// ============================================================

function mean(values) {
  if (values.length === 0) {
    return NaN;
  }

  return values.reduce(
    (sum, value) => sum + value,
    0
  ) / values.length;
}

function percentile(
  values,
  percentage
) {
  const sorted =
    [...values]
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

  if (sorted.length === 0) {
    return NaN;
  }

  const position =
    percentage / 100 *
    (sorted.length - 1) +
    1;

  const lower =
    Math.floor(position);

  const upper =
    Math.ceil(position);

  if (lower === upper) {
    return sorted[lower - 1];
  }

  return (
    sorted[lower - 1] +
    (position - lower) *
    (
      sorted[upper - 1] -
      sorted[lower - 1]
    )
  );
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "NaN";
  }

  const absolute = Math.abs(value);

  if (
    absolute !== 0 &&
    (
      absolute >= 100000 ||
      absolute < 0.0001
    )
  ) {
    return value.toExponential(4);
  }

  return value.toFixed(3);
}

function timestamp() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0"),
    String(
      date.getDate()
    ).padStart(2, "0"),
    "_",
    String(
      date.getHours()
    ).padStart(2, "0"),
    String(
      date.getMinutes()
    ).padStart(2, "0"),
    String(
      date.getSeconds()
    ).padStart(2, "0")
  ].join("");
}


// ============================================================
// BACKEND HEALTH
// ============================================================

async function checkBackendHealth() {
  try {
    const response = await fetch(
      `${window.PORTFLOW_API_BASE}/api/health`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const health = await response.json();

    backendBadge.textContent =
      `Backend: online (${health.version || "ready"})`;
    backendBadge.className = "backend-badge online";
  } catch (error) {
    backendBadge.textContent = "Backend: offline";
    backendBadge.className = "backend-badge offline";
  }
}

checkBackendHealth();

// ============================================================
// INITIAL FLOW SCREEN
// ============================================================

drawInitialFlow();

function drawInitialFlow() {
  flowContext.fillStyle = "#ffffff";
  flowContext.fillRect(
    0,
    0,
    flowCanvas.width,
    flowCanvas.height
  );

  flowContext.fillStyle = "#667085";
  flowContext.font = "22px Arial";
  flowContext.textAlign = "center";

  flowContext.fillText(
    "Run the simulation to initialize the port-flow animation.",
    flowCanvas.width / 2,
    flowCanvas.height / 2
  );
}
