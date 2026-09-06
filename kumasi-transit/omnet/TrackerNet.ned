package kumasi_cadence;

//
// One vehicle-mounted 4G/LTE-M tracker. Moves along a route at a (noisy) speed and
// sends a position report every reportInterval seconds. Store-and-forward is modelled
// by re-queueing lost reports when storeAndForward is true.
//
simple Tracker
{
    parameters:
        double reportInterval @unit(s) = default(30s);
        double speedKph = default(60);
        double speedJitter = default(0.15);          // fractional std-dev of the speed random walk
        double routeLengthKm = default(250);         // vehicle turns around at the end
        double payloadBytes = default(180);          // JSON position + MQTT/TCP/IP overhead
        double dwellTime @unit(s) = default(300s);   // layover at the terminus
        bool storeAndForward = default(false);
        @display("i=device/cellphone");
        @signal[sentBytes](type=double);
        @statistic[sentBytes](title="bytes sent"; record=sum,count; interpolationmode=none);
    gates:
        output out;
        input in;
}

//
// Cellular uplink: lossy with a random delay. Loss and delay are drawn per report.
//
channel TrackerLink extends ned.DatarateChannel
{
    parameters:
        double per = default(0.05);                       // packet error rate
        delay = default(truncnormal(1.5s, 0.5s));
        datarate = default(64kbps);                       // LTE-M class uplink
        @class(TrackerLinkChannel);
}

//
// Ingest server: keeps the last received position per tracker and measures, at a
// uniform sampling cadence, how far the *true* vehicle position is from the last
// known one. That gap is the error a passenger sees on the map.
//
simple Server
{
    parameters:
        double sampleInterval @unit(s) = default(1s);
        @display("i=device/server");
        @signal[positionError](type=double);
        @signal[reportAge](type=double);
        @signal[receivedReports](type=long);
        @statistic[positionError](title="position error at random instant (m)"; record=mean,max,histogram,vector?; interpolationmode=sample-hold);
        @statistic[reportAge](title="age of last received report (s)"; record=mean,max,histogram; interpolationmode=sample-hold);
        @statistic[receivedReports](title="reports received"; record=count; interpolationmode=none);
    gates:
        input in[];
        output out[];
}

network TrackerNet
{
    parameters:
        int numTrackers = default(10);
        double per = default(0.05);
        @display("bgb=600,300");
    submodules:
        tracker[numTrackers]: Tracker {
            @display("p=80,60,col,50");
        }
        server: Server {
            @display("p=450,150");
        }
    connections:
        for i=0..numTrackers-1 {
            tracker[i].out --> TrackerLink { per = parent.per; } --> server.in++;
            server.out++ --> TrackerLink { per = 0; } --> tracker[i].in;
        }
}
