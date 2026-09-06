// Position report carried from a tracker to the server.
namespace kumasi_cadence;

packet PositionReport
{
    int trackerId;
    double distanceAlongRoute;   // metres
    double speed;                // m/s
    simtime_t fixTime;           // when the GPS fix was taken
    int seq;
}
