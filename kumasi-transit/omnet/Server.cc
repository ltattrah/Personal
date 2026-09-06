#include <cmath>
#include <vector>
#include "Tracker.h"
#include "PositionReport_m.h"

using namespace omnetpp;

namespace kumasi_cadence {

// Ingest server: keeps the last received position per tracker and, at a uniform sampling
// cadence, measures how far the *true* vehicle position is from the last known one. That gap
// is the error a passenger sees on the map at a random instant.
class Server : public cSimpleModule
{
  protected:
    struct Last { bool have = false; double distance = 0; simtime_t fixTime = 0; };
    std::vector<Last> last;
    cMessage *sampleTimer = nullptr;
    simsignal_t positionErrorSignal, reportAgeSignal, receivedSignal;

    virtual void initialize() override;
    virtual void handleMessage(cMessage *msg) override;
    virtual void finish() override;
    void sample();
};

Define_Module(Server);

void Server::initialize()
{
    int n = getParentModule()->par("numTrackers");
    last.resize(n);
    positionErrorSignal = registerSignal("positionError");
    reportAgeSignal = registerSignal("reportAge");
    receivedSignal = registerSignal("receivedReports");
    sampleTimer = new cMessage("sample");
    scheduleAt(simTime() + par("sampleInterval").doubleValue(), sampleTimer);
}

void Server::handleMessage(cMessage *msg)
{
    if (msg == sampleTimer) {
        sample();
        scheduleAt(simTime() + par("sampleInterval").doubleValue(), sampleTimer);
        return;
    }
    auto *report = check_and_cast<PositionReport *>(msg);
    Last &l = last[report->getTrackerId()];
    if (!l.have || report->getFixTime() >= l.fixTime) {   // ignore out-of-order arrivals
        l.have = true;
        l.distance = report->getDistanceAlongRoute();
        l.fixTime = report->getFixTime();
    }
    emit(receivedSignal, (long)1);
    delete report;
}

void Server::sample()
{
    cModule *net = getParentModule();
    for (size_t i = 0; i < last.size(); i++) {
        if (!last[i].have)
            continue;
        auto *tracker = check_and_cast<Tracker *>(net->getSubmodule("tracker", i));
        emit(positionErrorSignal, std::fabs(tracker->getTruth() - last[i].distance));
        emit(reportAgeSignal, (simTime() - last[i].fixTime).dbl());
    }
}

void Server::finish()
{
    cancelAndDelete(sampleTimer);
    sampleTimer = nullptr;
}

}  // namespace kumasi_cadence
