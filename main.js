// ========================
// DATA LOADING & HELPERS
// ========================
let shotData = [];

async function loadShotData() {
    try {
        const response = await fetch("shots_2025.csv");
        const csvText = await response.text();
        const data = d3.csvParse(csvText);
        shotData = data.map(d => ({
            positionX: +d.xCordAdjusted,
            positionY: +d.yCordAdjusted,
            isGoal: d.goal === "true" || d.goal === "TRUE" || d.goal === "1"
        }));
        console.log(`✅ Loaded ${shotData.length} shots`);
        return true;
    } catch (err) {
        console.error("Error loading CSV:", err);
        return false;
    }
}

const RINK_IMAGE = "hockeyRink.jpg";

function renderContourPlot(containerId, filterType, options = {}) {
    if (!shotData.length) return;
    const { width = 600, height = 510, responsive = false } = options;

    let filtered = [...shotData];
    if (filterType === "goals") filtered = shotData.filter(d => d.isGoal === true);
    if (filterType === "non-goals") filtered = shotData.filter(d => d.isGoal === false);

    const container = d3.select(`#${containerId}`);
    container.html("");

    const allX = shotData.map(d => d.positionX);
    const allY = shotData.map(d => d.positionY);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const maxAbsY = Math.max(Math.abs(minY), Math.abs(maxY));

    const mapX = (x) => ((x - minX) / (maxX - minX)) * width;
    const mapY = (y) => height/2 - (y * (height/(2*maxAbsY)));

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    // only set width/height if not responsive
    if (!responsive) {
        svg.attr("width", width).attr("height", height);
    }

    svg.append("image")
        .attr("href", RINK_IMAGE)
        .attr("width", width)
        .attr("height", height)
        .attr("preserveAspectRatio", "none")
        .style("opacity", 0.85);

    const geoPath = d3.geoPath();

    if (filterType === "all" || filterType === "goals") {
        const goalsData = shotData.filter(d => d.isGoal === true);
        if (goalsData.length) {
            const points = goalsData.map(d => [mapX(d.positionX), mapY(d.positionY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(16).thresholds(6);
            const contours = density(points);
            const colorScale = d3.scaleSequentialLog()
                .domain([0, d3.max(contours, c => c.value)])
                .interpolator(d3.interpolateYlOrRd);
            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", d => geoPath(d))
                .attr("fill", d => colorScale(d.value))
                .attr("fill-opacity", 0.65)
                .attr("stroke", "#e69500")
                .attr("stroke-width", 0.8);
        }
    }

    if (filterType === "all" || filterType === "non-goals") {
        const nonData = shotData.filter(d => d.isGoal === false);
        if (nonData.length) {
            const points = nonData.map(d => [mapX(d.positionX), mapY(d.positionY)]);
            const density = d3.contourDensity()
                .x(d => d[0]).y(d => d[1])
                .size([width, height])
                .bandwidth(16).thresholds(6);
            const contours = density(points);
            const colorScale = d3.scaleSequentialLog()
                .domain([0, d3.max(contours, c => c.value)])
                .interpolator(d3.interpolatePuBu);
            svg.append("g")
                .selectAll("path")
                .data(contours)
                .enter()
                .append("path")
                .attr("d", d => geoPath(d))
                .attr("fill", d => colorScale(d.value))
                .attr("fill-opacity", 0.5)
                .attr("stroke", "#4a90e2")
                .attr("stroke-width", 0.8);
        }
    }

    svg.append("text")
        .attr("x", width - 85)
        .attr("y", 25)
        .attr("fill", "#111")
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .text(`🎯 ${filtered.length} shots`);
}

// ========================
// HERO CHART
// ========================
function setupHeroChart() {
    renderContourPlot("hero-chart", "all", { width: 800, height: 800, responsive: true });
    document.getElementById("hero-filter").addEventListener("change", (e) => {
        renderContourPlot("hero-chart", e.target.value, { width: 800, height: 800, responsive: true });
    });
}

// ========================
// SCROLLYTELLING WITH SCROLLAMA
// ========================
async function setupScrollama() {
    // Step definitions (used for both narration text and graph updates)
    const steps = [
        { title: "🏒 Overview: All Shots", text: "Complete shot distribution. Yellow-red = goals, purple-blue = missed.", filter: "all" },
        { title: "🔥 Power Play Opportunities", text: "More shots from the slot area. Density increases between faceoff circles.", filter: "goals" },
        { title: "🧊 Even Strength Analysis", text: "Wider shot distribution. Defensemen contribute from the point.", filter: "all" },
        { title: "⭐ Star Player Impact", text: "Top scorers concentrate on the left faceoff circle and slot.", filter: "goals" },
        { title: "🎯 Breakaway & Rush Shots", text: "High-danger chances from in close. Goal conversion peaks near the net.", filter: "goals" },
        { title: "📈 Season Trends", text: "Later in season, players focus on high-percentage scoring areas.", filter: "non-goals" }
    ];

    // Inject narration steps into the left column
    const narrationContainer = document.querySelector(".scrollyteller__narration");
    narrationContainer.innerHTML = steps.map(step => `
        <div class="narration-step" data-step-filter="${step.filter}">
            <h2>${step.title}</h2>
            <p>${step.text}</p>
        </div>
    `).join('');

    // Set up the initial graph in the right column
    const graphContainer = document.getElementById("st-graph");
    graphContainer.innerHTML = `
        <div class="graph-title">🏒 Shot Density – <span id="filter-label">All Shots</span></div>
        <div id="scrolly-graph"></div>
    `;
    renderContourPlot("scrolly-graph", "all");

    // Initialize Scrollama
    const scroller = scrollama();

    scroller
        .setup({
            step: ".narration-step",      // watch these elements
            offset: 0.5,                  // trigger when 50% of the step is in view
            debug: false
        })
        .onStepEnter(response => {
            // Get the filter from the current step's data attribute
            const filter = response.element.getAttribute("data-step-filter");
            const labelSpan = document.getElementById("filter-label");
            if (labelSpan) {
                labelSpan.innerText = filter === "all" ? "All Shots" :
                                      filter === "goals" ? "Goals Only" : "Missed/Saved";
            }
            renderContourPlot("scrolly-graph", filter);
        });

    // Handle window resize
    window.addEventListener("resize", scroller.resize);
}

// ========================
// INITIALIZATION
// ========================
async function init() {
    const loaded = await loadShotData();
    if (loaded) {
        setupHeroChart();
        await new Promise(r => setTimeout(r, 100)); // small delay to ensure DOM is ready
        setupScrollama();
    }
}

init();