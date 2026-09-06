-- Runs once when the TimescaleDB container initialises the database.
-- Tables are created by SQLAlchemy on first start; this turns positions into a hypertable
-- and adds PostGIS so KMA analysts can query fixes spatially.
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Convert after the app has created the table (safe to re-run).
CREATE OR REPLACE FUNCTION kumasi_enable_hypertables() RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'positions')
     AND NOT EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_name = 'positions') THEN
    PERFORM create_hypertable('positions', 'ts', migrate_data => true);
    PERFORM add_retention_policy('positions', INTERVAL '90 days');
  END IF;
END $$ LANGUAGE plpgsql;
