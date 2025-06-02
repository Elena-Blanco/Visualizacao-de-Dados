import { loadDb } from './duckdb-setup.js';
import * as d3 from 'd3';

const svgA = d3.select("#chartA");
const svgB = d3.select("#chartB");

async function main() {
  const db = await loadDb();
  const conn = await db.connect();

  const basePath = '/green/';
  const fileNames = [
    "green_tripdata_2023-01.parquet",
    "green_tripdata_2023-02.parquet",
    "green_tripdata_2023-03.parquet",
    "green_tripdata_2023-04.parquet",
    "green_tripdata_2023-05.parquet",
    "green_tripdata_2023-06.parquet",
  ];

  for (const fileName of fileNames) {
    const response = await fetch(basePath + fileName);
    if (!response.ok) {
      console.error(`Erro ao buscar arquivo: ${fileName}`, response.statusText);
      continue;
    }
    const buffer = await response.arrayBuffer();
    await db.registerFileBuffer(fileName, new Uint8Array(buffer));
  }

  const unionQuery = fileNames.map(fn => `SELECT * FROM read_parquet('${fn}')`).join(' UNION ALL ');

  // Consulta 1
  const resultA = await conn.query(`
  SELECT 
    strftime(lpep_pickup_datetime, '%w') AS dow,
    COUNT(*) AS count
  FROM (${unionQuery})
  WHERE lpep_pickup_datetime IS NOT NULL
  GROUP BY dow
  ORDER BY dow
  `);

  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const dayData = resultA.toArray().map(row => ({
  day: days[parseInt(row.dow, 10)],
  value: Number(row.count) // ← conversão aqui
}));


  // Consulta 2
  const resultB = await conn.query(`
  SELECT 
    CAST(strftime(lpep_pickup_datetime, '%H') AS INT) AS hour,
    AVG(tip_amount) AS tip
  FROM (${unionQuery})
  WHERE tip_amount >= 0 AND lpep_pickup_datetime IS NOT NULL
  GROUP BY hour
  ORDER BY hour
  `);

  const tipData = resultB;

  // Gráfico A - Barras
  svgA.selectAll("*").remove();
  const margin = { top: 20, right: 30, bottom: 50, left: 60 };
  const width = +svgA.attr("width") - margin.left - margin.right;
  const height = +svgA.attr("height") - margin.top - margin.bottom;
  const gA = svgA.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xA = d3.scaleBand()
    .domain(dayData.map(d => d.day))
    .range([0, width])
    .padding(0.2);

  const yA = d3.scaleLinear()
    .domain([0, d3.max(dayData, d => d.value)])
    .nice()
    .range([height, 0]);

  gA.append("g").call(d3.axisLeft(yA));
  gA.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xA));

  gA.selectAll(".bar")
    .data(dayData)
    .enter()
    .append("rect")
    .attr("class", d => (d.day === 'Sábado' || d.day === 'Domingo') ? "bar weekend" : "bar")
    .attr("x", d => xA(d.day))
    .attr("y", d => yA(d.value))
    .attr("width", xA.bandwidth())
    .attr("height", d => height - yA(d.value))
    .attr("fill", d => (d.day === 'Sábado' || d.day === 'Domingo') ? 'tomato' : 'steelblue');

  // Gráfico B - Linha
  svgB.selectAll("*").remove();
  const gB = svgB.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const xB = d3.scaleLinear()
    .domain([0, 23])
    .range([0, width]);

  const yB = d3.scaleLinear()
    .domain([0, d3.max(tipData, d => d.tip)])
    .nice()
    .range([height, 0]);

  gB.append("g").call(d3.axisLeft(yB));
  gB.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xB).ticks(24).tickFormat(d => `${d}h`));

  const line = d3.line()
    .x(d => xB(d.hour))
    .y(d => yB(d.tip));

  gB.append("path")
    .datum(tipData)
    .attr("class", "line")
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 2)
    .attr("d", line);
}

main();
