var width = 960,
    height = 600;

var mapPath = "/cmdoptesc/raw/4714c586f69425043ae3/us.json";

var projection = d4.geoAlbersUsa()
    .scale(1280)
    .translate([width / 2, height / 2]);

var path = d4.geoPath()
    .projection(projection);

var svg, dataset;

var policyCircleScale, stateCircleScale;


stateCircleScale = d4.scaleLinear().range([5, 30]);

d3.json("./data/us.json", function(error, us) {
  if (error) return console.error(error);

  svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);
  

  svg.append("path")
    .datum(topojson.feature(us, us.objects.land))
    .attr("d", path)
    .attr("class", "land-boundary");

  svg.append("path")
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

        // if(data.length <= 1000){ policyCircleMax = 10 }
        // else if(data.length <= 1000){ policyCircleMax = 4 - data.length/400 }
        // else if(data.length <= 5000){ policyCircleMax = 2 - data.length/2500 }
        // else { policyCircleMax = 1 }

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

        var states, stateCircles;

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
        svg.selectAll(".g_state")
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
            var pack, root_size,
                g_state,
                nodes, circles, innerCircleRadius;
            
            root_size = state.value,  // Update the size of root circle according to the summed value
            pack = d4.pack().size([root_size, root_size]).padding(2),
            g_state = svg.selectAll(".g_state_" + state.data.name)
                        // .attr("transform", function(d){
                        //     return "translate(" + 
                        //         (projection([d.data.lng, d.data.lat])[0]-d.value*3) + "," + (projection([d.data.lng, d.data.lat])[1]-d.value*3) + ")"
                        // }),
            root_node = pack(state),
            nodes = root_node.descendants(),
            circles = g_state.selectAll(".circle")
                        .data(nodes);
            
            circles.style("fill", "white");

            // state.x = projection([state.data.lng, state.data.lat])[0];
            // state.y = projection([state.data.lng, state.data.lat])[1];
        
            // Set the state circles to the fixed coordinate with summed radius

            // circles.enter()
            //     .append("circle")
            //     .attr("class", function(d) { return d.parent ? ("circle circle_policy circle_policy_" + d.parent.data.name) 
            //                                             : ("circle circle_state circle_state_" + d.data.name); 
            //                                         })
            //     .style("fill", "red")
            //     .style("stroke", "black")
            //     .transition().delay(400)
            //     .attr("r", function(d){
            //         if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) {
            //             innerCircleRadius = d.r;
            //         }
            //         //console.log(d3.select(this).attr("class"), innerCircleRadius, d.r);
            //         return d.r;
            //     })
            //     .attr("cx", function(d){
            //         if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) 
            //             return d.x - innerCircleRadius;
            //         return d.x - innerCircleRadius;
            //     })
            //     .attr("cy", function(d){
            //         if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) 
            //             return d.y - innerCircleRadius;
            //         return d.y - innerCircleRadius;
            //     });
            
            // //console.log(d3.select(".circle_state_" + state.data.name), state.data.children.length, innerCircleRadius);
            
            // circles.transition().duration(400)
            //     .attr("r", function(d){
            //         if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) {
            //             //console.log(d3.select(this).attr("class"), innerCircleRadius, d.r);
            //             innerCircleRadius = d.r;
            //         }
            //         return d.r;
            //     })
            //     .attr("cx", function(d){
            //         if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) 
            //             return d.x - innerCircleRadius;
            //         return d.x - innerCircleRadius;
            //     })
            //     .attr("cy", function(d){
            //         if (d3.select(this).attr("class") === "circle circle_state circle_state_" + d.data.name) 
            //             return d.y - innerCircleRadius;
            //         return d.y - innerCircleRadius;
            //     });
            
            // circles.exit()
            //     .attr("r", function(d){
            //         return 0;
            //     })
            //     .transition().duration(200)
            //     .remove();
        });

        //*** Control outer circles

        states.forEach(function(d){
            d.x = projection([d.data.lng, d.data.lat])[0];
            d.y = projection([d.data.lng, d.data.lat])[1];
        })
        
        stateCircles = svg.selectAll(".outer_circle_state")
            .data(states);

        stateCircles.enter().append("circle")
            .attr("class", function(d){
                return "outer_circle_state outer_circle_state_" + d.data.name;
            })
            // .attr("transform", function(d){
            //     return "translate(" + 
            //         (projection([d.data.lng, d.data.lat])[0]-d.value) + "," + (projection([d.data.lng, d.data.lat])[1]-d.value) + ")"
            // })
            .transition().delay(400)
            // .attr("cx", function(d){
            //     return projection([d.data.lng, d.data.lat])[0];
            // })
            // .attr("cy", function(d){
            //     return projection([d.data.lng, d.data.lat])[1];
            // })
            .attr("r", function(d){
                //console.log(d.x, d.y);
                return d.r + 3;
            })
            .style("fill", "none")
            .style("stroke", "black");
        
        stateCircles
            .transition().duration(300)
            // .attr("cx", function(d){
            //     return projection([d.data.lng, d.data.lat])[0];
            // })
            // .attr("cy", function(d){
            //     return projection([d.data.lng, d.data.lat])[1];
            // })
            .attr("r", function(d){
                return d.r + 3;
            })
            .style("fill", "none")
            .style("stroke", "black");
        
        stateCircles.exit()
            // .attr("cx", function(d){
            //     return projection([d.data.lng, d.data.lat])[0];
            // })
            // .attr("cy", function(d){
            //     return projection([d.data.lng, d.data.lat])[1];
            // })
            .attr("r", function(d){
                return 0;
            })
            .remove();
        //stateCircles.forEach(function(circle, index, wholeCircles){ console.log(collide(circle, wholeCircles)); });
        
        //force().gravity(3.0).size([800,600]).charge(-1).nodes(forceNodes);
        var simulation = d4.forceSimulation(states)
                // .force("gravity", d4.forceManyBody(30).distanceMin(2))
                // .force('charge', d4.forceManyBody().strength(0))
                //.size([800,600])
                //.charge(-1).nodes(states)
                //.velocityDecay(1)
                //.force('charge', d4.forceManyBody().strength(-10))
                // .force("forceX", d4.forceX().strength(.1).x(100 * .5))
                // .force("forceY", d4.forceY().strength(.1).y(100 * .5))
                .force('collision', d4.forceCollide().strength(1).iterations(12)    // strength should be closer to 1
                        .radius(function(d) {
                            return d.r*1.05;
                        }))
                .on("tick", tick);

        function tick (){
            stateCircles
            .attr("cx", function(d){
                return d.x;
            })
            .attr("cy", function(d){
                return d.y;
            })
            // .attr(
            //     "transform", 
            //     function(d) { return "translate(" + d.x + "," + d.y + ")"; }
            // )
        }
    };
      
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

    // svg
    //   .style("background", color(-1))
    //   .on("click", function() { zoom(root); });

    // zoomTo([width / 2, height / 2, root.r * 2 + margin]);

});

function zoom(d) {
    var focus0 = focus; focus = d;

    var transition = d3.transition()
        .duration(d3.event.altKey ? 7500 : 750)
        .tween("zoom", function(d) {
          var i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2 + margin]);
          return function(t) { zoomTo(i(t)); };
        });

    transition.selectAll("text")
      .filter(function(d) { return d.parent === focus || this.style.display === "inline"; })
        .style("fill-opacity", function(d) { return d.parent === focus ? 1 : 0; })
        .on("start", function(d) { if (d.parent === focus) this.style.display = "inline"; })
        .on("end", function(d) { if (d.parent !== focus) this.style.display = "none"; });
  }

function zoomTo(v) {
    var diameter = height,
        k = diameter / v[2],
        view = v;

    node.attr("transform", function(d) { return "translate(" + (d.x - v[0]) * k + "," + (d.y - v[1]) * k + ")"; });
    circle.attr("r", function(d) { return d.r * k; });
}