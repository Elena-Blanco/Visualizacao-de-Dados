import { loadDb } from './duckdb-setup.js';
import * as d3 from 'd3';

const svgA = d3.select("#chartA");
const svgB = d3.select("#chartB");


const defaultBarColor = 'steelblue';
const weekendColor = 'tomato';
const highlightColor = 'orange';
const lineColor = 'steelblue';
const pointColor = 'steelblue';
const gridColor = '#e0e0e0';
const textColor = '#333';
const axisColor = '#555';

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
    try {
      const response = await fetch(basePath + fileName);
      if (!response.ok) {
        console.error(`Erro ao buscar arquivo: ${fileName}`, response.statusText);
        continue;
      }
      const buffer = await response.arrayBuffer();
      await db.registerFileBuffer(fileName, new Uint8Array(buffer));
    } catch (error) {
      console.error(`Falha ao processar o arquivo ${fileName}:`, error);
      continue;
    }
  }

  const unionQuery = fileNames.map(fn => `SELECT * FROM read_parquet('${fn}')`).join(' UNION ALL ');

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
    value: Number(row.count)
  }));

  const resultB = await conn.query(`
    SELECT
      CAST(strftime(lpep_pickup_datetime, '%H') AS INT) AS hour,
      AVG(tip_amount) AS tip
    FROM (${unionQuery})
    WHERE tip_amount >= 0 AND lpep_pickup_datetime IS NOT NULL
    GROUP BY hour
    ORDER BY hour
  `);

  const tipData = resultB.toArray().map(row => ({
    hour: Number(row.hour),
    tip: Number(row.tip)
  }));

 
  const tooltip = d3.select("#tooltip");
  if (tooltip.empty()) {
    console.warn("Elemento #tooltip não encontrado. Crie um <div id='tooltip'></div> no seu HTML.");
  } else {
    
    tooltip.style("position", "absolute")
           .style("opacity", 0)
           .style("background-color", "white")
           .style("border", "1px solid #ccc")
           .style("border-radius", "4px")
           .style("padding", "8px")
           .style("font-size", "12px")
           .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
           .style("pointer-events", "none"); 
  }

  svgA.selectAll("*").remove();
  const marginA = { top: 50, right: 30, bottom: 70, left: 80 }; 
  const widthA = +svgA.attr("width") - marginA.left - marginA.right;
  const heightA = +svgA.attr("height") - marginA.top - marginA.bottom;
  const gA = svgA.append("g").attr("transform", `translate(${marginA.left},${marginA.top})`);

  const xA = d3.scaleBand()
    .domain(dayData.map(d => d.day))
    .range([0, widthA])
    .padding(0.2);

  const yA = d3.scaleLinear()
    .domain([0, d3.max(dayData, d => d.value)])
    .nice()
    .range([heightA, 0]);

  // Eixo Y
  gA.append("g")
    .call(d3.axisLeft(yA).tickFormat(d3.format(",.0f"))) 
    .selectAll("text")
    .style("fill", axisColor);

  // Eixo X
  gA.append("g")
    .attr("transform", `translate(0,${heightA})`)
    .call(d3.axisBottom(xA))
    .selectAll("text")
    .style("fill", axisColor)
    .attr("transform", "rotate(-30)") 
    .style("text-anchor", "end");

  gA.append("text")
    .attr("x", widthA / 2)
    .attr("y", 0 - (marginA.top / 2) - 5)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .style("fill", textColor)
    .text("Volume de Corridas Durante a Semana");

  gA.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - marginA.left + 15)
    .attr("x", 0 - (heightA / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", textColor)
    .text("Número de Corridas");

  gA.append("text")
    .attr("x", widthA / 2)
    .attr("y", heightA + marginA.bottom - 15)
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", textColor)
    .text("Dia da Semana");

  gA.selectAll(".bar")
    .data(dayData)
    .enter()
    .append("rect")
    .attr("class", d => (d.day === 'Sábado' || d.day === 'Domingo') ? "bar weekend" : "bar")
    .attr("x", d => xA(d.day))
    .attr("y", d => yA(d.value))
    .attr("width", xA.bandwidth())
    .attr("height", d => heightA - yA(d.value))
    .attr("fill", d => (d.day === 'Sábado' || d.day === 'Domingo') ? weekendColor : defaultBarColor)
    .on("mouseover", function (event, d) {
      tooltip
        .style("opacity", 1)
        .html(`<b>${d.day}</b><br>Corridas: ${d.value.toLocaleString()}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");

      d3.select(this)
        .transition()
        .duration(200)
        .attr("fill", highlightColor);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function (event, d) {
      tooltip.style("opacity", 0);
      d3.select(this)
        .transition()
        .duration(200)
        .attr("fill", (d.day === 'Sábado' || d.day === 'Domingo') ? weekendColor : defaultBarColor);
    });

  svgB.selectAll("*").remove();
  const marginB = { top: 50, right: 30, bottom: 70, left: 80 };
  const widthB = +svgB.attr("width") - marginB.left - marginB.right;
  const heightB = +svgB.attr("height") - marginB.top - marginB.bottom;
  const gB = svgB.append("g").attr("transform", `translate(${marginB.left},${marginB.top})`);

  const xB = d3.scaleLinear()
    .domain([0, 23]) 
    .range([0, widthB]);

  const yB = d3.scaleLinear()
    .domain([0, d3.max(tipData, d => d.tip)])
    .nice()
    .range([heightB, 0]);

  gB.append("g")
    .attr("class", "grid grid-y")
    .call(d3.axisLeft(yB)
      .tickSize(-widthB)
      .tickFormat("")
    )
    .selectAll("line")
    .attr("stroke", gridColor)
    .attr("stroke-dasharray", "2,2");

  gB.append("g")
    .attr("class", "grid grid-x")
    .attr("transform", `translate(0,${heightB})`)
    .call(d3.axisBottom(xB)
      .ticks(24)
      .tickSize(-heightB)
      .tickFormat("")
    )
    .selectAll("line")
    .attr("stroke", gridColor)
    .attr("stroke-dasharray", "2,2");

  gB.append("g")
    .call(d3.axisLeft(yB).tickFormat(d => `$${d.toFixed(2)}`)) 
    .selectAll("text")
    .style("fill", axisColor);

  gB.append("g")
    .attr("transform", `translate(0,${heightB})`)
    .call(d3.axisBottom(xB).ticks(12).tickFormat(d => `${d}h`)) 
    .selectAll("text")
    .style("fill", axisColor);

  gB.append("text")
    .attr("x", widthB / 2)
    .attr("y", 0 - (marginB.top / 2) - 5)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .style("fill", textColor)
    .text("Variação da Gorjeta Média ao Longo do Dia");

  gB.append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", 0 - marginB.left + 15)
    .attr("x", 0 - (heightB / 2))
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", textColor)
    .text("Gorjeta Média ($)");

  gB.append("text")
    .attr("x", widthB / 2)
    .attr("y", heightB + marginB.bottom - 25) 
    .attr("text-anchor", "middle")
    .style("font-size", "12px")
    .style("fill", textColor)
    .text("Hora do Dia");

  const line = d3.line()
    .x(d => xB(d.hour))
    .y(d => yB(d.tip))
    .curve(d3.curveMonotoneX); 

  gB.append("path")
    .datum(tipData)
    .attr("class", "line")
    .attr("fill", "none")
    .attr("stroke", lineColor)
    .attr("stroke-width", 2.5) 
    .attr("d", line);

  gB.selectAll(".point")
    .data(tipData)
    .enter()
    .append("circle")
    .attr("class", "point")
    .attr("cx", d => xB(d.hour))
    .attr("cy", d => yB(d.tip))
    .attr("r", 4)
    .attr("fill", pointColor)
    .attr("stroke", "white") 
    .attr("stroke-width", 1)
    .on("mouseover", function (event, d) {
      tooltip
        .style("opacity", 1)
        .html(`<b>${d.hour}:00</b><br>Gorjeta média: $${d.tip.toFixed(2)}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");

      d3.select(this)
        .transition()
        .duration(150)
        .attr("fill", highlightColor)
        .attr("r", 6);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function () {
      tooltip.style("opacity", 0);
      d3.select(this)
        .transition()
        .duration(150)
        .attr("fill", pointColor)
        .attr("r", 4);
    });
}

main().catch(error => console.error("Erro na função main:", error));