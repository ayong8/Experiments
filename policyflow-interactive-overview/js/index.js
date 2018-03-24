var width = 960,
    height = 600;

var mapPath = "/cmdoptesc/raw/4714c586f69425043ae3/us.json";

var projection = d3.geo.albersUsa()
    .scale(1280)
    .translate([width / 2, height / 2]);

var path = d3.geo.path()
    .projection(projection);

var svg, dataset;

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
      .datum(topojson.mesh(us, us.objects.counties, function(a, b) { return a !== b && (a.id / 1000 | 0) === (b.id / 1000 | 0); }))
      .attr("d", path)
      .attr("class", "county-boundary");

  svg.append("path")
      .datum(topojson.mesh(us, us.objects.states, function(a, b) { return a !== b; }))
      .attr("d", path)
      .attr("class", "state-boundary");

  d3.tsv("./data/raw_777_1.txt")
    .row(function(d) {
      return {
        policy: d.policy,
        lat: parseFloat(d.lat),
        lng: parseFloat(d.long),
        state: d.state,
        adoption_case: d.adoption_case,
        created_at: new Date(d.created_at)
      };
    })
    .get(function(err, rows) {
    	if (err) return console.error(err);

        dataset = rows;
    });

    var displaySites = function(data) {
        console.log("filtered data length", data.length);

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
            
            state_obj = { 'state': state, 'lat': lat, 'lng': lng, 'permalink': permalink, 'adoptions': adoptions };

            return state_obj;
        });

        var circles = svg.selectAll(".site")
            .data(dataGroupByState);
        
        console.log("circle", circles);
        
        circles.enter().append("circle")
            .attr("class", "site")
            .attr("cx", function(d) {
              return projection([d.lng, d.lat])[0];
            })
            .attr("cy", function(d) {
              return projection([d.lng, d.lat])[1];
            })
            .transition().duration(400)
            .attr("r", function(d){
                console.log("adoption cases for each state", d.state, d.adoptions.length);
                return d.adoptions.length;
            });
        
        circles.transition().duration(400)
            .attr("r", function(d){
                console.log("adoption cases for each state", d.state, d.adoptions.length);
                return d.adoptions.length;
            });
      
        circles.exit()
            .transition().duration(200)
            .remove();
      };
      
    var minDateUnix = new Date('2014-07-01');
    var maxDateUnix = new Date('2016-07-21');
    var secondsInDay = 24;
    
    d3.select('#slider3').call(d3.slider()
    .axis(true).min(minDateUnix).max(maxDateUnix)
    .on("slide", function(evt, value) {
        
        var newData = _(dataset).filter( function(site) {
            //console.log("current silder time:", site.created_at, value);
            return site.created_at < value;
        })
        // console.log("New set size ", newData.length);
    
        displaySites(newData);
    })
    );

});

