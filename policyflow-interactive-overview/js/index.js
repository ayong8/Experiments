var width = 960,
    height = 600,
    view = [width/2, height/2, height/2],
    zoomMargin = 30;

var mapPath = "/cmdoptesc/raw/4714c586f69425043ae3/us.json";

var projection = d4.geoAlbersUsa()
    .scale(1280)
    .translate([width / 2, height / 2]);

var path = d4.geoPath()
    .projection(projection);

var svg, dataset, g;

var policyCircleScale, stateCircleScale,
    rootNodes = [];


stateCircleScale = d4.scaleLinear().range([5, 30]);

d3.json("./data/us.json", function(error, us) {
  if (error) return console.error(error);

  svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

  g = svg.append("g")
            .attr("transform", "translate(0,0)");
  
  g.append("path")
    .datum(topojson.feature(us, us.objects.land))
    .attr("d", path)
    .attr("class", "land-boundary");

  g.append("path")
      .datum(topojson.mesh(us, us.objects.states, function(a, b) { return a !== b; }))
      .attr("d", path)
      .attr("class", "state-boundary");

  d3.csv("./data/policy_adoptions.csv")
    .row(function(d) {
      return {
        policy: d.policy_id,
        lat: parseFloat(d.lat),
        lng: parseFloat(d.long),
        state: d.state,
        state_name: d.state_name,
        value: d.adoption_case,
        adopted_year: new Date(d.adopted_year)
      };
    })
    .get(function(err, rows) {
    	if (err) return console.error(err);

        dataset = rows;
    });

    var displaySites = function(data) {
        //*** Calculate # of cumulative adoption cases for each policy
        // Output: array of adoption object itself... 
        // # of adoption case will be the size of policy circle
        data.map(function(adoption){
            var adopted_cases;  // radius of policy circle
            adopted_cases = data.filter(function(d){
                    return (d.policy === adoption.policy) && 
                        (d.adopted_year < adoption.adopted_year);
                });
            return Object.assign(adoption, { "value": adopted_cases.length+1 });
        });

        //*** Rescale the size of policy circle
        var policyCircleMin, policyCircleMax;

        policyCircleMax = 4;
        policyCircleMin = policyCircleMax/3;
        policyCircleScale = d4.scaleLinear().range([policyCircleMin, policyCircleMax]);
        policyCircleScale.domain(d4.extent(data.map(function(d){ return d.value; })));

        // Reassign the scaled policy circle size
        data.map(function(adoption){
            return Object.assign(adoption, { "value": policyCircleScale(adoption.value) });
        })

        //*** Change the data structure grouped by state
        /*
            [  ...
                {   
                    state: 'WA',
                    lat: 140.64,
                    lng: 46.57,
                    permalink: abc-def,
                    adoptions: [
                        ...
                        {  },
                        ...
                    ]
                }
                ... 
            ]
        */
        var dataGroupByState = _.groupBy(data, 'state');

        dataGroupByState = Object.keys(dataGroupByState).map(function(state){
            var state_obj = {};
            var lat = dataGroupByState[state][0].lat,
                lng = dataGroupByState[state][0].lng,
                permalink = dataGroupByState[state][0].permalink,
                adoptions = dataGroupByState[state];

            //*** Filter out some policy circles that have lower score than the threshold
            var maxScore = d3.max(adoptions, function(d){ return d.adopted_cases; });
            // Filter out 
            // adoptions.filter(function(d) {
            //     return d.adopted_cases > (maxScore / 1.5);
            // });
            if (adoptions.length > 20){
                adoptions = adoptions.sort(function(a, b){ 
                        return d3.descending(a.adopted_cases, b.adopted_cases); 
                    }).slice(0, 19);
            }
            
            state_obj = { 'name': state, 'lat': lat, 'lng': lng, 'children': adoptions };

            return state_obj;
        });

        var states;

        // Define each state as root
        // Convert each state key to an object with functions and properties for hierarchical structure
        states = dataGroupByState.map(function (state){
            return d4.hierarchy(state)
                    .sum(function(d){ 
                        return d.value; 
                    }).sort(function(a, b){ return b.value - a.value; });
        });

        stateCircleScale.domain(d4.extent(states.map(function(d){ return d.value; })));

        // Hook the dataset with objects
        g.selectAll(".g_state")
            .data(states)
            .enter().append("g")
            .attr("class", function(d){
                return "g_state g_state_" + d.data.name;
            })
            .attr("transform", function(d){
                return "translate(" + 
                    (projection([d.data.lng, d.data.lat])[0]) + "," + (projection([d.data.lng, d.data.lat])[1]) + ")"
            });
        
        //*** Update circles with updated data
        states.forEach(function(state){
            // Get an array of all nodes from the state data
            var pack, rootSize,
                gState,
                nodes, circles, innerCircleRadius;
            
            rootSize = state.value,  // Update the size of root circle according to the summed value
            pack = d4.pack().size([rootSize, rootSize]).padding(2),
            gState = g.selectAll(".g_state_" + state.data.name),
            rootNode = pack(state),
            nodes = rootNode.descendants(),
            circles = gState.selectAll(".circle")
                        .data(nodes);
            
            rootNodes.push(rootNode);
            d3.selectAll(".circle_policy").style("fill", "white");
        
            // Set the state circles to the fixed coordinate with summed radius

            circles.enter()
                .append("circle")
                .attr("class", function(d) { return d.parent ? ("circle circle_policy circle_policy_" + d.parent.data.name) 
                                                        : ("circle circle_state circle_state_" + d.data.name); 
                })
                .style("stroke", "black")
                .transition().delay(400)
                .attr("r", function(d){
                    if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) {
                        innerCircleRadius = d.r;
                        return d.r + 3;
                    }
                    //console.log(d3.select(this).attr("class"), innerCircleRadius, d.r);
                    return d.r;
                })
                .attr("cx", function(d){
                    if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) 
                        return d.x - innerCircleRadius;
                    return d.x - innerCircleRadius;
                })
                .attr("cy", function(d){
                    if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) 
                        return d.y - innerCircleRadius;
                    return d.y - innerCircleRadius;
                });
                            
            //console.log(d3.select(".circle_state_" + state.data.name), state.data.children.length, innerCircleRadius);
            
            circles.transition().duration(400)
                .attr("r", function(d){
                    if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) {
                        //console.log(d3.select(this).attr("class"), innerCircleRadius, d.r);
                        innerCircleRadius = d.r;
                        return d.r + 3;
                    }
                    return d.r;
                })
                .attr("cx", function(d){
                    if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) 
                        return d.x - innerCircleRadius;
                    return d.x - innerCircleRadius;
                })
                .attr("cy", function(d){
                    if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) 
                        return d.y - innerCircleRadius;
                    return d.y - innerCircleRadius;
                });
            
            circles.exit()
                .attr("r", function(d){
                    return 0;
                })
                .transition().duration(200)
                .remove();

            var innerCircle,
                stateData = [state],
                outerCircle = gState.select(".circle_state");
            innerCircle = gState.selectAll(".inner_state_circle")
                    .data(stateData);
            
            innerCircle
                .enter().append("circle")
                .attr("class", "inner_state_circle")
                .attr("cx", function(d){ 
                    return outerCircle.attr("cx"); })
                .attr("cy", function(d){ return outerCircle.attr("cy"); })
                .attr("r", function(d){ return innerCircleRadius; });
            
            innerCircle.transition().duration(400)
                .attr("cx", function(d){ return outerCircle.attr("cx"); })
                .attr("cy", function(d){ return outerCircle.attr("cy"); })
                .attr("r", function(d){ return innerCircleRadius; });
            
            innerCircle.exit()
                .remove();

            gState.selectAll(".circle_state")
                .on("click", function(d) {
                    var transform = d3.transform(d3.select(this.parentNode).attr("transform")),
                        focusInfo = {
                            "x": transform.translate[0],
                            "y": transform.translate[1],
                            "r": d.r
                        }    

                    if(focus !== rootNode) zoom(focusInfo), d3.event.stopPropagation(); 
                });
        });
    };

    

    // rootNodes
    //     .forEach(function(rootNode){
    //         g.on("click", function(d){ zoom(rootNode) });
    //     });
      
    var minDateUnix = new Date('1800-01-01').getYear() + 1900;
    var maxDateUnix = new Date('2017-12-31').getYear() + 1900;
    var step = 60*60*24;
    
    d3.select('#slider3').call(d3.slider()
        .axis(true).min(minDateUnix).max(maxDateUnix)
        .on("slide", function(evt, value) {
            var newValue = value;
            d3.select("#current_year").transition()
                .tween("text", function(d) {
                    var self = this;
                    var i = d3.interpolateRound(Math.floor(d3.select(this).text()), Math.floor(newValue));
                    return function(t) {
                        d3.select(this).text(i(t));
                    };
                });
            var newData = _(dataset).filter( function(site) {
                //console.log("current silder time:", site.created_at, value);
                var adopted_year = site.adopted_year.getYear() + 1900;
                return adopted_year < value;
            })
            // console.log("New set size ", newData.length);
        
            displaySites(newData);
        })
    );
    svg.on("click", function() { zoom([width/2-10, height/2-10, height/2]); });
});



function zoom(d) {
    var focus0 = focus; focus = d;

    var transition = d3.transition()
        .duration(d3.event.altKey ? 7500 : 750)
        .tween("zoom", function(d) {
          var i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2 + zoomMargin]);
          console.log("focus", focus.x, focus.y)
          return function(t) { 
              console.log(t);
              zoomTo(i(t)); };
        });

    // transition.selectAll("text")
    //   .filter(function(d) { return d.parent === focus || this.style.display === "inline"; })
    //     .style("fill-opacity", function(d) { return d.parent === focus ? 1 : 0; })
    //     .on("start", function(d) { if (d.parent === focus) this.style.display = "inline"; })
    //     .on("end", function(d) { if (d.parent !== focus) this.style.display = "none"; });
  }

function zoomTo(v) {
    var diameter = height,
        k = diameter / v[2],
        view = v;
    if(isNaN(v[0])){
        g.transition().attr("transform", "translate(0,0)")
    } else {
        g.attr("transform", "translate(" + width/2 + "," + height/2 + ")scale(" + k + ")translate(" + -v[0] + "," + -v[1] + ")")
    }
    // g.attr("transform", function(d) {
    //     console.log("zoom to: ", v);
    //     var transform = d3.transform(d3.select(this).attr("transform")),
    //         x = transform.translate[0],
    //         y = transform.translate[1];
    //     console.log(transform.translate[0]);
    //     console.log(x, y, k);
    //     console.log("v: ", v[0], v[1])
    //     return "translate(" + (0-v[0]) + "," + (0-v[1]) + ')'; });
    // g.transition()
    //       .duration(750)
    //       .attr('transform', 'translate(' + v[0] + ',' + v[1] + ')scale(' + k + ')')
    // g.selectAll("circle").attr("r", function(d) { return d.r * k; });
}

