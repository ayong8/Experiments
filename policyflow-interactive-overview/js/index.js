var width = 960,
    height = 600,
    view = [width/2, height/2, height/2],
    zoomMargin = 30;

var tip = d4.tip()
    .attr("class", "d3-tip")
    .offset([-10, 0])
    .html(function(d) {
      //return xCat + ": " + d[xCat] + "<br>" + yCat + ": " + d[yCat];
      return d.parent? ("Policy_id" + ": " + d.data.policy)
                : ("State: " + d.data.name);
    });

var mapPath = "/cmdoptesc/raw/4714c586f69425043ae3/us.json",
    projection = d4.geoAlbersUsa()
        .scale(1280)
        .translate([width / 2, height / 2]),
    path = d4.geoPath()
        .projection(projection);

var svg, dataset, g;
var policyCircleScale, stateCircleScale,
    stateInfScale,
    rootNodes = [];

stateCircleScale = d4.scaleLinear().range([5, 30]);
stateColorScale = d4.scaleLinear()  // state circle color depends on state's influence score
        .range(["#fffea4","#df0000"])
        .domain(d4.extent(Object.values(Object.values(static.centrality)[0]).map(function(d){ return d.pageRank; })));
policyColorScale = d4.scaleLinear()
        .range(["yellow","#f00"])
        .domain([0, 5]);
stateInfScale = d4.scaleLinear()
        .range([1, 1.5])
        .domain(d4.extent(Object.values(Object.values(static.centrality)[0]).map(function(d){ return d.pageRank; })));


d3.json("./data/us.json", function(error, us) {
    if (error) return console.error(error);

    svg = d3.select("body").append("svg")   // d3 to d4 revokes weird behavior
        .attr("width", width)
        .attr("height", height);

    svg.call(tip);
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

    var dataGroupByStateUntilYear;
    var displaySites = function(dataUntilYear) {
        //*** Calculate # of cumulative adoption cases for each policy
        // i.g., How many states adopted the policy by the given year
        // Output: array of adoption object itself... 
        // # of adoption cases will be the size of policy circle
        dataUntilYear.map(function(adoption){
            // (radius of policy circle) = (# of adoption cases) x (first adoption year / state's adopted year)
            var adoptionCases,  // # of states that adopted this policy
                manyAdoptionScore,
                earlyAdoptionScore,
                policyScore,
                firstAdoptionYear = static.policyStartYear[adoption.policy]["policy_start"],
                stateAdoptionYear = adoption.adopted_year.getFullYear();
            adoptionCases = dataUntilYear.filter(function(d){
                    return (d.policy === adoption.policy) && 
                        (d.adopted_year < stateAdoptionYear);
                });
            
            manyAdoptionScore = adoptionCases.length+1;
            earlyAdoptionScore = Math.round(Math.pow((stateAdoptionYear-1650) / (firstAdoptionYear-1650), 10), 1);
            console.log(stateAdoptionYear / firstAdoptionYear, earlyAdoptionScore, manyAdoptionScore);

            return Object.assign(adoption, { "value": manyAdoptionScore * earlyAdoptionScore });
        });

        //*** Rescale the size of policy circle
        var policyCircleMin, policyCircleMax;

        policyCircleMax = 4;
        policyCircleMin = policyCircleMax / 10;
        policyCircleScale = d4.scaleLinear()
            .range([policyCircleMin, policyCircleMax]);
        policyCircleScale
            .domain(d4.extent(dataUntilYear.map(function(d){ return d.value; })));

        // Reassign the scaled policy circle size
        dataUntilYear.map(function(adoption){
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
        var statesInHierarchy;
        var allAdoptions = [];

        dataGroupByStateUntilYear = _.groupBy(dataUntilYear, 'state');
        Object.keys(dataGroupByStateUntilYear).forEach(function(state){
            allAdoptions.concat(dataGroupByStateUntilYear[state].adopted_cases);
        });
        dataGroupByStateUntilYear = Object.keys(dataGroupByStateUntilYear).map(function(state){
            var maxPolicyScore = d3.max(allAdoptions, function(d){ return d.value; });
            return filterPolicyByThreshold(state, maxPolicyScore/1.01);
        });

        // Define each state as root
        // Convert each state key to an object with functions and properties for hierarchical structure
        statesInHierarchy = dataGroupByStateUntilYear.map(function (state){
            return d4.hierarchy(state)
                    .sum(function(d){ 
                        return d.value; 
                    }).sort(function(a, b){ return b.value - a.value; });
        });

        stateCircleScale
            .domain(d4.extent(statesInHierarchy
                .map(function(d){ return d.value; })
            ));

        // Hook the dataset with objects
        g.selectAll(".g_state")
            .data(statesInHierarchy)
            .enter().append("g")
            .attr("class", function(d){
                return "g_state g_state_" + d.data.name;
            })
            .attr("transform", function(d){
                return "translate(" + 
                    (projection([d.data.lng, d.data.lat])[0]) + "," + (projection([d.data.lng, d.data.lat])[1]) + ")"
            });
        
        
        
    //*** Update circles with updated data
        statesInHierarchy.forEach(function(state){
            var pack, rootSize,
                gState,
                nodes, circles, circlesData;
            
            // innerCircleRadius = simple sum of policy circle radius
            var innerCircle, outerCircle,
                innerCircleRadius, outerCircleRadius,
                stateInHierarchy = [state],
                stateName = state.data.name,
                statePageRank = static.centrality.centralities[stateName]["pageRank"];
            
            rootSize = state.value,  // Update the size of root circle according to the summed value
            pack = d4.pack().size([rootSize, rootSize]).padding(2),
            gState = g.selectAll(".g_state_" + stateName),
            rootNode = pack(state),
            nodes = rootNode.descendants(),
            circlesData = gState.selectAll(".circle")
                        .data(nodes);
            
            // d4.selectAll(".circle_policy")
            //     .style("fill", policyCircleScale(statePageRank));
        
            // Set the state circles to the fixed coordinate with summed radius
            circlesData.enter()
                .append("circle")
                .attr("class", function(d) { 
                    return d.parent ? ("circle circle_policy circle_policy_" + stateName) 
                                    : ("circle outer_circle_state outer_circle_state_" + stateName); 
                })
                .style("fill", function(d){
                    return d.parent? policyColorScale(d.r) : stateColorScale(statePageRank);
                })
                .transition().duration(400)
                .attr("r", function(d){
                    var policyCircleRadius = d.r;
                    // If it's outer state circle, save the radius to "innerCircleRadius"
                    // because the whole policy circles should transform in x and y by the radius
                    if (d4.select(this).attr("class") === "circle outer_circle_state outer_circle_state_" + stateName) {
                        innerCircleRadius = d.r;
                        outerCircleRadius = innerCircleRadius * stateInfScale(statePageRank);
                        return outerCircleRadius;
                    }
                    return policyCircleRadius;
                })
                .attr("cx", function(d){
                    return d.x - innerCircleRadius;
                })
                .attr("cy", function(d){
                    return d.y - innerCircleRadius;
                });
            
            circlesData
                .transition().duration(400)
                .style("fill", function(d){
                    return d.parent? policyColorScale(d.r) : stateColorScale(statePageRank);
                })
                .attr("r", function(d){
                    var policyCircleRadius = d.r;
                    // If it's outer state circle, save the radius to "innerCircleRadius"
                    // because the whole policy circles should transform in x and y by the radius
                    if (d4.select(this).attr("class") === "circle outer_circle_state outer_circle_state_" + stateName) {
                        innerCircleRadius = d.r;
                        outerCircleRadius = innerCircleRadius * stateInfScale(statePageRank);
                        return outerCircleRadius;
                    }
                    return policyCircleRadius;
                })
                .attr("cx", function(d){
                    return d.x - innerCircleRadius;
                })
                .attr("cy", function(d){
                    return d.y - innerCircleRadius;
                })
                //.style("stroke", "none");
            
            circlesData.exit()
                .attr("r", 0)
                .transition().duration(200)
                .remove();
            
            d4.selectAll(".circle")
                .on("mouseover", function(d){
                    console.log("coming in")
                    tip.show(d);
                })
                .on("mouseout", function(d){
                    tip.hide(d);
                });
            
            outerCircle = gState.select(".outer_circle_state")
                    .style("fill", stateColorScale(statePageRank));
            innerCircle = gState.selectAll(".inner_circle_state")
                    .data(stateInHierarchy);
            
            innerCircle
                .enter().insert("circle", ".outer_circle_state + *")    // Put inner circle right after outer circle
                .attr("class", "inner_circle_state")
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

            //*** Click event for outer circle
            gState.selectAll(".outer_circle_state")
                .on("click", function(d) {
                    var transform = d3.transform(d4.select(this.parentNode).attr("transform")),
                        focusInfo = {
                            "x": transform.translate[0],
                            "y": transform.translate[1],
                            "r": d.r
                        }    

                    if(focus !== rootNode) zoom(focusInfo), d3.event.stopPropagation(); 
                });
            //console.log(stateName, innerCircleRadius, outerCircleRadius);
            state.outerCircleRadius = outerCircleRadius;
        });

        // var simulation = d4.forceSimulation(statesInHierarchy)
        //     // .force("gravity", d4.forceManyBody(30).distanceMin(2))
        //     // .force('charge', d4.forceManyBody().strength(0))
        //     //.size([800,600])
        //         //.charge(-1).nodes(states)
        //         .velocityDecay(0.99999)
        //         .force('charge', d4.forceManyBody().distanceMin(3).strength(0.8))
        //         //.force("forceX", d4.forceX().strength(.1).x(100))
        //         //.force("forceY", d4.forceY().strength(.1).y(100))
        //         // .force('collision', d4.forceCollide().strength(1).iterations(2)    // strength should be closer to 1
        //         //         .radius(function(d) {
        //         //             return d.outerCircleRadius*3;
        //         //         }))
        //         .on("tick", tick);

        // function tick (){
        //     d3.selectAll(".g_state")
        //     .attr("transform", function(d) { 
        //         var outerCircle = d3.select(this).select(".outer_circle_state"),
        //             x = outerCircle.attr("cx"),
        //             y = outerCircle.attr("cy");

        //         //return "translate(" + (width/2 + d.x) + "," + (height/2 + d.y) + ")";
        //         return "translate(" + (projection([d.data.lng, d.data.lat])[0] + d.x) + "," + (projection([d.data.lng, d.data.lat])[1] + d.y) + ")";
        //     });
        // }
    };

    // d4.selectAll(".circle_policy")
    //     .on("mouseover", function(d){
    //         tip.show(d);
    //     })
    //     .on("mouseout", function(d){
    //         tip.hide(d);
    //     });

    // rootNodes
    //     .forEach(function(rootNode){
    //         g.on("click", function(d){ zoom(rootNode) });
    //     });
      
    var minDateUnix = new Date('1800-01-01').getFullYear();
    var maxDateUnix = new Date('2017-12-31').getFullYear();
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
                var adopted_year = site.adopted_year.getYear() + 1900;
                return adopted_year < value;
            })
        
            displaySites(newData);
        })
    );
    svg.on("click", function() { zoom([width/2-10, height/2-10, height/2]); });

//*** All functions (inside d3.csv())
    function filterPolicyByThreshold(state, threshold){
        var state_obj = {};
        var lat = dataGroupByStateUntilYear[state][0].lat,
            lng = dataGroupByStateUntilYear[state][0].lng,
            permalink = dataGroupByStateUntilYear[state][0].permalink,
            adoptions = dataGroupByStateUntilYear[state];
        
        adoptions.filter(function(d){
            return d.value > threshold;
        })
        
        // adoptions = adoptions.sort(function(a, b){
        //     return d3.descending(a.value, b.value);
        // }).slice(0, 40);
    
        // //*** Filter out some policy circles that have lower score than the threshold
        // var maxScore = d3.max(adoptions, function(d){ return d.adopted_cases; });
        // // Filter out 
        // // adoptions.filter(function(d) {
        // //     return d.adopted_cases > (maxScore / 1.5);
        // // });
        // if (adoptions.length > threshold){
        //     adoptions = adoptions.sort(function(a, b){ 
        //             return d3.descending(a.adopted_cases, b.adopted_cases); 
        //         }).slice(0, threshold);
        // }
        return { 
            'name': state, 
            'lat': lat, 
            'lng': lng, 
            'children': adoptions 
        };
    }
    
    function zoom(d) {
        var focus0 = focus; focus = d;
    
        var transition = d3.transition()
            .duration(d3.event.altKey ? 7500 : 750)
            .tween("zoom", function(d) {
                var i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2 + zoomMargin]);
                return function(t) {
                    zoomTo(i(t)); 
                };
            });
    
        //*** Draw the whole state circle
        // Prepare the whole state data
    
        d3.select(".g_state_CA").selectAll("circle").style("stroke-width", "0.2");
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
    }
    
});

