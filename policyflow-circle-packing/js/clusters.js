var margin = { top: 20, right: 50, bottom: 50, left: 50 },
    outerWidth = document.getElementById("clusters-div").offsetWidth,
    outerHeight = document.getElementById("clusters-div").offsetHeight,
    width = outerWidth - margin.left - margin.right,
    height = outerHeight - margin.top - margin.bottom;

var x = d3.scaleLinear()
    .range([0, width]).nice();

var y = d3.scaleLinear()
    .range([height, 0]).nice();

var xCat = "V1",
    yCat = "V2",
    colorCat = "Cluster",
    title = "Policy_id",
    ramp=d3.scaleLinear().domain([0,2]).range(["red","green","blue"]);

d3.csv("data/students_clusters.csv", function(data) {
  data.forEach(function(d) {
    d.V1 = +d.V1;
    d.V2 = +d.V2;
    d.Cluster = d.Cluster;
    d.Id = d.Id;
  });

  var xMax = d3.max(data, function(d) { return d[xCat]; }) * 1.05,
      xMin = d3.min(data, function(d) { return d[xCat]; }),
      xMin = xMin > 0 ? 0 : xMin,
      yMax = d3.max(data, function(d) { return d[yCat]; }) * 1.05,
      yMin = d3.min(data, function(d) { return d[yCat]; }),
      yMin = yMin > 0 ? 0 : yMin;

  console.log(xMin, xMax);
  console.log(yMin, yMax);
  x.domain([xMin, xMax]);
  y.domain([yMin, yMax]);

  var xAxis = d3.axisBottom(x)
      .tickSize(-height);

  var yAxis = d3.axisLeft(y)
      .tickSize(-width);

  //var color = d3.scale.category10();
  var color = d3.scaleOrdinal().range(["mediumpurple","#154360","#B500C2"])
  var tip = d3.tip()
      .attr("class", "d3-tip")
      .offset([-10, 0])
      .html(function(d) {
        //return xCat + ": " + d[xCat] + "<br>" + yCat + ": " + d[yCat];
        return title + ": " + d['Id'];
      });

  var zoomBeh = d3.zoom()
      .scaleExtent([0, 500])
      .on("zoom", zoom);

  var svg = d3.select("#clusters-div")
    .append("svg")
      .attr("width", outerWidth)
      .attr("height", outerHeight)
    .append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
      .call(zoomBeh);

  svg.call(tip);

  svg.append("rect")
      .attr("width", width)
      .attr("height", height);

  svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis)
    .append("text")
      .attr("class", "label")
      .attr("x", width)
      .attr("y", margin.bottom - 10)
      .style("text-anchor", "end")
      .text("x");

  svg.append("g")
      .attr("class", "y axis")
      .call(yAxis)
    .append("text")
      .attr("class", "label")
      .attr("transform", "rotate(-90)")
      .attr("y", -margin.left)
      .attr("dy", ".71em")
      .style("text-anchor", "end")
      .text("y");

  var objects = svg.append("svg")
      .attr("class", "objects")
      .attr("width", width)
      .attr("height", height);

  objects.append("svg:line")
      .attr("class", "axisLine hAxisLine")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", width)
      .attr("y2", 0)
      .attr("transform", "translate(0," + height + ")");

  objects.append("svg:line")
      .attr("class", "axisLine vAxisLine")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", height);


  objects.selectAll(".dot")
      .data(data)
      .enter().append("circle")
      .attr("class", function(d, i){
        return "dot dot_" + (i+1);
      })
      .attr("id", function(d, i){
        return i+1;
      })
      .attr("r", function(d) { return 6; })
      .attr("transform", transform)
      .style("fill", function(d) { return color(d[colorCat]); })
      .on("mouseover", function(d, i){
        tip.show(d);

        d3.select(this)
          .style("stroke", "black")
          .style("stroke-width", 3);
          
        d3.select("path.user" + (i+1))
          .style("stroke", "black")
          .style("stroke-width", 2)
          .attr("opacity", 1);
      })
      .on("mouseout", function(d, i){
        tip.hide(d);

        d3.select(this).style("stroke", "none");

        d3.select("path.user" + (i+1))
          .style("stroke", "black")
          .style("stroke-width", 1)
          .attr("opacity", 0.2);
      });

  var legend = svg.selectAll(".legend")
      .data(color.domain())
    .enter().append("g")
      .classed("legend", true)
      .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

  legend.append("circle")
      .attr("r", 3.5)
      .attr("cx", width + 20)
      .attr("fill", color);

  legend.append("text")
      .attr("x", width + 26)
      .attr("dy", ".35em")
      .text(function(d) { return d; });

  d3.select("input").on("click", change);

  function change() {
    xCat = "Carbs";
    xMax = d3.max(data, function(d) { return d[xCat]; });
    xMin = d3.min(data, function(d) { return d[xCat]; });

    zoomBeh.x(x.domain([xMin, xMax])).y(y.domain([yMin, yMax]));

    var svg = d3.select("#clusters-div").transition();

    svg.select(".x.axis").duration(750).call(xAxis).select(".label").text(xCat);

    objects.selectAll(".dot").transition().duration(1000).attr("transform", transform);
  }

  function zoom() {
    var new_xScale = d3.event.transform.rescaleX(x),
        new_yScale = d3.event.transform.rescaleY(y);

    svg.select(".x.axis").call(d3.axisBottom(new_xScale));
    svg.select(".y.axis").call(d3.axisLeft(new_yScale));

    svg.selectAll(".dot")
        .attr("transform", function(d){
          return "translate(" + new_xScale(d[xCat]) + "," + new_yScale(d[yCat]) + ")";
        });
  }

  function transform(d) {
    return "translate(" + x(d[xCat]) + "," + y(d[yCat]) + ")";
  }
});