#include <algorithm>
#include "Tracker.h"
#include "PositionReport_m.h"

using namespace omnetpp;

namespace kumasi_cadence {

Define_Module(Tracker);

void Tracker::initialize()
{
    baseSpeed = par("speedKph").doubleValue() / 3.6;
    speed = baseSpeed;
    routeLength = par("routeLengthKm").doubleValue() * 1000.0;
    distance = uniform(0, routeLength);   // vehicles start spread along the corridor
    lastMove = simTime();
    sentBytesSignal = registerSignal("sentBytes");

    moveTimer = new cMessage("move");
    scheduleAt(simTime() + 1, moveTimer);
    reportTimer = new cMessage("report");
    // Desynchronise trackers so the server does not see bursts.
    scheduleAt(simTime() + uniform(0, par("reportInterval").doubleValue()), reportTimer);
}

void Tracker::advance()
{
    simtime_t now = simTime();
    double dt = (now - lastMove).dbl();
    lastMove = now;
    if (now < dwellUntil)
        return;
    double jitter = par("speedJitter").doubleValue();
    speed = std::max(2.0, std::min(baseSpeed * 1.3, speed + normal(0, baseSpeed * jitter * 0.1)));
    distance += direction * speed * dt;
    if (distance >= routeLength || distance <= 0) {
        distance = std::max(0.0, std::min(routeLength, distance));
        direction = -direction;
        dwellUntil = now + par("dwellTime").doubleValue();
    }
}

void Tracker::sendReport()
{
    auto *report = new PositionReport("pos");
    report->setTrackerId(getIndex());
    report->setDistanceAlongRoute(distance);
    report->setSpeed(simTime() < dwellUntil ? 0.0 : speed);
    report->setFixTime(simTime());
    report->setSeq(seq++);
    report->setByteLength((int64_t)par("payloadBytes").doubleValue());
    emit(sentBytesSignal, par("payloadBytes").doubleValue());
    send(report, "out");
}

void Tracker::handleMessage(cMessage *msg)
{
    if (msg == moveTimer) {
        advance();
        scheduleAt(simTime() + 1, moveTimer);
    }
    else if (msg == reportTimer) {
        advance();
        sendReport();
        scheduleAt(simTime() + par("reportInterval").doubleValue(), reportTimer);
    }
    else {
        delete msg;   // downlink messages from the server are not modelled further
    }
}

void Tracker::finish()
{
    cancelAndDelete(moveTimer);
    cancelAndDelete(reportTimer);
    moveTimer = reportTimer = nullptr;
}

// Cellular uplink that drops a fraction of reports (parameter "per"). A dropped report leaves
// the server with a stale position until the next successful one, which is exactly the effect
// the cadence study needs to price.
class TrackerLinkChannel : public cDatarateChannel
{
  protected:
    virtual cChannel::Result processMessage(cMessage *msg, const SendOptions& options, simtime_t t) override
    {
        cChannel::Result r = cDatarateChannel::processMessage(msg, options, t);
        if (!r.discard && uniform(0, 1) < par("per").doubleValue())
            r.discard = true;
        return r;
    }
};

Define_Channel(TrackerLinkChannel);

}  // namespace kumasi_cadence
