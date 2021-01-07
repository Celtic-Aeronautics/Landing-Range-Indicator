// Settings:
const rangeOpacity = 0.15;
const rangeStrokeOpacity = 0.85;
const rangeStrokeLineWidth = 1.15;
const rangeColor = "#FF0000";

// Some generic constants:
const ftToMeter = 0.3048;
const sqFtToSqMeter = 0.092903;
const ozToKg = 0.0283495;
const airDensity = 1.225; // kg/m^3

// Globals:
var isMetric = true;
var apogee = 0.0;
var terminalVel = 0.0;
var map;
var curLocation = {lat : 53.3245, lng : -2.1926 };
var windSpeed = 0.0;
var windDirection = 0.0;
var rocketMass = 0.0;
var rocketLateralArea = 0.0;

var launchRangeCircle;
var launchLocationMarker;
var landingLocationMarker;
var landingMarker;
var landingDirection;
var weatherVane;

function vectorMagnitude(vec)
{
    var m = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1]);
    return m;
}

function vectorNormalize(vec)
{
    var mag = vectorMagnitude(vec);
    return [vec[0] / mag, vec[1] / mag];
}

function getApogee()
{
    return isMetric ? apogee : (apogee * ftToMeter);
}

function getTerminalVel()
{
    return isMetric ? terminalVel : (terminalVel * ftToMeter);
}

// Returns the wind magnitude
function getWindSpeed()
{
    return isMetric ? windSpeed : (windSpeed * ftToMeter);
}

// Returns the (normalized) wind direction
function getWindDirection()
{
    var beta = windDirection * Math.PI / 180.0;
    var x = Math.cos(beta);
    var y = Math.sin(beta);
    return vectorNormalize([-x, -y]);
}

function getRocketMass()
{
    return isMetric ? rocketMass : (rocketMass * ozToKg);
}

function getRocketLateralArea()
{
    return isMetric ? rocketLateralArea : (rocketLateralArea * sqFtToSqMeter);
}

var firstTime = true;
function refreshUnits()
{
    // Distance labels:
    var distLabels = document.getElementsByClassName("distUnit"); 
    for(const ele of distLabels)
    {
        ele.innerText = isMetric ? "m" : "ft";
    } 

    // Speed labels:
    var speedLabels = document.getElementsByClassName("speedUnit"); 
    for(const ele of speedLabels)
    {
        ele.innerText = isMetric ? "m/s" : "ft/s";
    }

    // Mass labels:
    var massLabels = document.getElementsByClassName("massUnit"); 
    for(const ele of massLabels)
    {
        ele.innerText = isMetric ? "kg" : "oz";
    }

    // Area labels:
    var areaLabels = document.getElementsByClassName("areaUnit"); 
    for(const ele of areaLabels)
    {
        ele.innerText = isMetric ? "m^2" : "ft^2";
    }

    // Gather settings and update the values:
    if(firstTime)
    {
        firstTime = false;
    }
    else
    {
        gatherSettings();

        // Figure out conversion direction, this expects that 'isMetric' was changed before calling this:
        var distConv = isMetric ? ftToMeter : ( 1 / ftToMeter);
        var weightConv = isMetric ? ozToKg : ( 1 / ozToKg);
        var areaConv = isMetric ? sqFtToSqMeter : (1 / sqFtToSqMeter);

        // Now convert the values:
        document.getElementById("apogee").value =  (apogee * distConv).toFixed(2);
        document.getElementById("terminalVel").value = (terminalVel * distConv).toFixed(2);
        document.getElementById("windSpeed").value = (windSpeed * distConv).toFixed(2);
        document.getElementById("rocketMass").value = (rocketMass * weightConv).toFixed(2);
        document.getElementById("rocketLateralArea").value = (rocketLateralArea * areaConv).toFixed(2);
    }
}

function onUnitChange(metric)
{
    isMetric = metric;
    refreshUnits();
}

function updateMapRange(radius, landingPos)
{
    // Range indicator:
    launchRangeCircle.setVisible(true);
    launchRangeCircle.setRadius(radius);
    launchRangeCircle.setCenter(curLocation);

    // Lading pos, this is 0,0 based (in meters)
    var curPosLocation = latLongToPos(curLocation);
    var landingPosKm = math.divide(landingPos, 1000.0);
    landingPosKm = math.add(curPosLocation, landingPosKm); // Get the real landing position
    var landingPosLatLng = posToLatLong(landingPosKm);
    landingLocationMarker.setVisible(true);
    landingLocationMarker.setCenter(landingPosLatLng);
}

function computeDragForce(fluidVel, fluidDensity, dragCoef, area)
{
    var mu = 0.5 * fluidDensity * dragCoef * area;
    var velSq = [fluidVel[0] * fluidVel[0], fluidVel[1] * fluidVel[1]];
    var velSign = [math.sign(fluidVel[0]), math.sign(fluidVel[1])];
    return math.multiply(math.multiply(velSq, [mu, mu]), velSign);
}

function gatherSettings()
{
    apogee = +document.getElementById("apogee").value;
    terminalVel = +document.getElementById("terminalVel").value;
    windDirection = +document.getElementById("windDirection").value;
    windSpeed = +document.getElementById("windSpeed").value;
    rocketMass = +document.getElementById("rocketMass").value;
    rocketLateralArea = +document.getElementById("rocketLateralArea").value;
}

function onRefresh()
{
    // Gather settings:
    gatherSettings();
    // console.log(apogee + "," + terminalVel + "," + windDirection + "," + windSpeed + "," + rocketMass);

    // Integrate:
    var timeToGround = getApogee() / getTerminalVel();
    var deltaTime = 0.05;
    var pos = [0.0, 0.0];
    var vel = [0.0, 0.0];
    var wind = math.multiply(getWindDirection(), getWindSpeed()); // Direction and magnitude.
    var maxVel = 0.0;
    for(var time = 0.0; time < timeToGround; time += deltaTime)
    {
        var relativeVel = math.subtract(wind, vel);
        var curDrag = computeDragForce(relativeVel, airDensity, 0.75, getRocketLateralArea());
        var curAccel = math.divide(curDrag, getRocketMass());

        vel = math.add(vel, math.multiply(curAccel, deltaTime));
        pos = math.add(pos, math.multiply(vel, deltaTime));

        // Clamp large values...
        var velXSign = Math.sign(vel[0]);
        if(Math.abs(vel[0]) > 65000.0)
        {
            vel[0] = 65000.0 * velXSign;
        }
        var velYSign = Math.sign(vel[1]);
        if(Math.abs(vel[1]) > 65000.0)
        {
            vel[1] = 65000.0 * velYSign;
        }

        maxVel = Math.max(maxVel, vectorMagnitude(relativeVel));
    }
    
    console.log(maxVel);

    // Update indicators:
    var radius = vectorMagnitude(pos); // In meters.
    updateMapRange(radius, pos);
    updateWeatherVane(radius);

    // Focus new location:
    map.panTo(curLocation);
}

function updateLoc()
{
    document.getElementById("locationLat").value = curLocation.lat.toFixed(4);
    document.getElementById("locationLong").value = curLocation.lng.toFixed(4);
    map.panTo(curLocation);

    // Launch position:
    launchLocationMarker.setVisible(true);
    launchLocationMarker.setCenter(curLocation);
}

// Returns approx position in km
function latLongToPos(latLong)
{
   var latPos = latLong.lat * 111.32;
   var longPos = latLong.lng * 40075.0 * Math.cos(latLong.lat * Math.PI / 180.0) / 360.0; 
   return [latPos, longPos];
}

// Returns latlong from position in km
function posToLatLong(pos)
{
    var lat = pos[0] / 111.32;
    var long = pos[1] / (40075.0 * Math.cos(lat * Math.PI / 180.0) / 360.0);
    return  {lat : lat, lng : long };
}

function updateWeatherVane(radius)
{
    var fudge = 2.0;
    var radiusKm = (radius - fudge) / 1000.0;
    var winDir = getWindDirection();
    var origin = math.add(latLongToPos(curLocation), math.multiply(winDir, -radiusKm)); // Start where the wind comes from
    var originLatLng = posToLatLong(origin);

    var dest = math.add(origin, math.multiply(winDir, radiusKm * 0.5)); // Cover half radius
    var destLatLng = posToLatLong(dest);

    const lineSymbol = {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    };

    if(weatherVane)
    {
        weatherVane.setMap(null);
    }
    weatherVane = new google.maps.Polyline({
        path : [
            originLatLng, destLatLng
        ],
        icons : [
            {
                icon : lineSymbol, 
                offset : "100%"
            },
        ],
        strokeColor : '#ADD8E6',
        zIndex: 3,
        map : map,
    });
}

function initMap()
{
    // Setup the map:
    map = new google.maps.Map(document.getElementById('map'), {
        center: curLocation,
        zoom: 8
    });
    map.setOptions({
        disableDefaultUI : true,
        disableDoubleClickZoom : true,
        gestureHandling : "greedy",
    });
    map.setMapTypeId("hybrid");
    map.addListener("click", (mapEvent) => {
        curLocation.lat = mapEvent.latLng.lat();
        curLocation.lng = mapEvent.latLng.lng();
        updateLoc();
    });
    map.setZoom(17.0);

    // Create the range indicator:
    launchRangeCircle = new google.maps.Circle({
        strokeColor: rangeColor,
        strokeOpacity: rangeStrokeOpacity,
        strokeWeight: rangeStrokeLineWidth,
        fillColor: rangeColor,
        fillOpacity: rangeOpacity,
        map,
        center: curLocation,
        radius: 300.0,
        zIndex : 2,
        clickable : false,
    });
    launchRangeCircle.setVisible(false);

    // Create location indicator:
    launchLocationMarker = new google.maps.Circle({
        strokeColor: "#000000",
        strokeOpacity: 1.0,
        strokeWeight: 2,
        fillColor: "#000000",
        fillOpacity: 0.5,
        map,
        center: curLocation,
        radius: 6.0,
        zIndex : 2,
    });
    launchLocationMarker.setVisible(false);

    // Landing location:
    landingLocationMarker = new google.maps.Circle({
        strokeColor: "#FFFFFF",
        strokeOpacity: 1.0,
        strokeWeight: 1.5,
        fillColor: "#FFFFFF",
        fillOpacity: 0.5,
        map,
        center: curLocation,
        radius: 6.0,
        zIndex : 2,
    });
    landingLocationMarker.setVisible(false);

    updateLoc();

    refreshUnits(isMetric);

    onRefresh();
}