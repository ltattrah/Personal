#ifndef KUMASI_CADENCE_TRACKER_H
#define KUMASI_CADENCE_TRACKER_H

#include <omnetpp.h>

namespace kumasi_cadence {

// Vehicle motion + periodic reporting. The tracker's own kinematics are the ground truth the
// server measures against; getTruth() is read by the Server through the module tree, the usual
// OMNeT++ shortcut for oracle knowledge in a simulation.
class Tracker : public omnetpp::cSimpleModule
{
  public:
    double getTruth() const { return distance; }

  protected:
    omnetpp::cMessage *reportTimer = nullptr;
    omnetpp::cMessage *moveTimer = nullptr;
    double distance = 0;        // metres along the route
    double direction = 1;       // +1 outbound, -1 inbound
    double speed = 0;           // m/s
    double baseSpeed = 0;
    double routeLength = 0;
    omnetpp::simtime_t dwellUntil = 0;
    omnetpp::simtime_t lastMove;
    int seq = 0;
    omnetpp::simsignal_t sentBytesSignal;

    virtual void initialize() override;
    virtual void handleMessage(omnetpp::cMessage *msg) override;
    virtual void finish() override;
    void advance();
    void sendReport();
};

}  // namespace kumasi_cadence

#endif
