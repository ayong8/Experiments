var width = 960,
    height = 600;

var mapPath = "/cmdoptesc/raw/4714c586f69425043ae3/us.json";
console.log(d3);

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
        console.log("filtered data length", data.length);

        // Calculate # of cumulative adoption cases for policy circle
        data.map(function(adoption){
            var adopted_case;
            adopted_case = data.filter(function(d){
                    return (d.policy === adoption.policy) && 
                        (d.adopted_year < adoption.adopted_year);
                });
            return Object.assign(adoption, { "value": adopted_case.length+1 });
        });

        var policyCircleMin, policyCircleMax;

        if(data.length <= 1000){ policyCircleMax = 10 }
        else if(data.length <= 1000){ policyCircleMax = 4 - data.length/400 }
        else if(data.length <= 5000){ policyCircleMax = 2 - data.length/2500 }
        else { policyCircleMax = 1 }

        policyCircleMin = policyCircleMax/20;
        policyCircleScale = d4.scaleLinear().range([policyCircleMin, policyCircleMax]);
        policyCircleScale.domain(d4.extent(data.map(function(d){ return d.value; })));

        data.map(function(adoption){
            return Object.assign(adoption, { "value": policyCircleScale(adoption.value) });
        })

        // Change the data structure grouped by state
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
                    });
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
                    (projection([d.data.lng, d.data.lat])[0]-d.value) + "," + (projection([d.data.lng, d.data.lat])[1]-d.value) + ")"
            });


        states.forEach(function(state){
            // Get an array of all nodes from the state data
            var pack, root_size,
                g_state,
                nodes, circles;
            
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
        
            // Set the state circles to the fixed coordinate with summed radius

            circles.exit()
                .transition().duration(200)
                .attr("r", function(d){
                    return 0;
                })
                .remove();

            circles.enter()
                .append("circle")
                .attr("class", function(d) { return d.parent ? d.children ? 
                                                        "circle" 
                                                        : ("circle circle_policy circle_policy_" + d.parent.data.name) 
                                                        : ("circle circle_state circle_state_" + d.data.name); 
                                                    })
                .style("fill", "red")
                .style("stroke", "black")
                .transition().delay(400)
                .attr("cx", function(d){
                    return d.x;
                })
                .attr("cy", function(d){
                    return d.y;
                })
                .attr("r", function(d){
                    return d.r;
                });
            
            circles.transition().duration(400)
                .attr("cx", function(d){
                    return d.x;
                })
                .attr("cy", function(d){
                    return d.y;
                })
                .attr("r", function(d){
                    return d.r;
                });
        });
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

});

