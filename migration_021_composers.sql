-- ============================================================
-- migration_021_composers.sql
-- Composers table + cowriters table
-- ============================================================

-- ── CREATE TABLES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS composers (
  composer_id   VARCHAR(10)  PRIMARY KEY,
  first_name    TEXT,
  last_name     TEXT,
  full_name     TEXT,
  ipi_number    TEXT,
  location      TEXT,
  middle_name   TEXT,
  pro           TEXT,
  date_added    DATE,
  status        TEXT NOT NULL DEFAULT 'active',
  is_jup        BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS cowriters (
  id          SERIAL PRIMARY KEY,
  full_name   TEXT NOT NULL,
  ipi_number  TEXT,
  pro         TEXT
);

-- ── SEED COMPOSERS ───────────────────────────────────────────
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R04', 'Tim', 'O''Kane', 'Tim-Ryan O''Kane', '630951163', 'Brooklyn, NY', NULL, 'ASCAP', '2015-07-22', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R09', 'Zach', 'McNees', 'Zach McNees', '670838911', 'Brooklyn, NY', NULL, 'ASCAP', '2015-07-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R11', 'Christos', 'Andreou', 'Christos Andreou', '605973336', 'London, UK', NULL, 'ASCAP', '2013-09-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R12', 'Natasha', 'Tyrimos', 'Natasha Tyrimos', '745525040', 'London, UK', NULL, 'PRS', '2014-05-15', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R14', 'Simon', 'Hesselein', 'Simon Hesselein', '252362094', 'New York, NY', NULL, 'GEMA', '2014-02-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R15', 'Kari', 'Steinert', 'Kari Steinert', '230978754', 'Yardley, PA', NULL, 'BMI', '2015-05-29', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R16', 'Jacob', 'Lawson', 'Jacob Lawson', '550319624', 'Gainesville, FL', NULL, 'BMI', '2013-10-09', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R18', 'Jon', 'Madof', 'Jon Madof', '355676527', 'White Plains, NY', NULL, 'BMI', '2015-07-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R21', 'Tony', 'Wilson', 'Tony Wilson', '225955846', 'Whitestone, NY', NULL, 'PRS', '2014-09-25', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R23', 'Franco', 'Caviglia', 'Franco Caviglia', '667653403', 'Barcelona, SPAIN', NULL, 'ASCAP', '2015-06-25', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R25', 'Sean', 'Hagon', 'Sean Hagon', '663219641', 'Plymouth. Ma', NULL, 'BMI', '2015-01-30', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R26', 'Johannes', 'Seywald', 'Johannes Seywald', '553187933', 'Kufstein, AUSTRIA', NULL, 'AKM', '2014-10-22', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R27', 'Aaron', 'Piazza', 'Aaron Di Piazza', '732724058', 'Brooklyn, NY', NULL, 'ASCAP', '2014-10-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R28', 'Mario', 'Lopez', 'Mario Lopez', '753644623', 'Gold River, CA', NULL, 'BMI', '2014-10-16', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R29', 'Yoshie', 'Fruchter', 'Yoshie Fruchter', '766584884', 'Brooklyn, NY', NULL, 'ASCAP', '2015-08-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R30', 'David', 'Janus', 'David Janus', '611986928', 'Paderborn, GERMANY', NULL, 'GEMA', '2014-05-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R31', 'Maurice', 'Stute', 'Maurice Stute', '906286426', 'Paderborrn, GERMANY', NULL, 'GEMA', '2014-05-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R32', 'Ulrich', 'Bannenberg', 'Ulrich Bannenberg', '702091683', 'Paderborn, GERMANY', NULL, 'GEMA', '2014-05-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R33', 'Tobias', 'Vogel', 'Tobias Vogel', '597251024', 'Paderborn, Germany', NULL, 'GEMA', '2014-05-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R34', 'Lars', 'Wallem', 'Lars Wallem', '258984', 'Paderborn, Germany', NULL, 'GEMA', '2014-05-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R35', 'Lars', 'Hesse', 'Lars Hesse', '406448956', 'Paderborn, Germany', NULL, 'GEMA', '2014-05-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R36', 'Jan', 'Jirasek', 'Jan Jirasek', '201785784', 'Czech Republic', NULL, 'GEMA', '2015-07-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R37', 'Steve', 'Skinner', 'Steve Skinner', '144989430', 'Montclair, NJ', NULL, 'BMI', '2013-11-22', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R38', 'Justin', 'Shearn', 'Justin Shearn', '568403533', 'Manchester, UK', NULL, 'PRS', '2013-11-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R39', 'Mike', 'Williams', 'Mike Williams', '338929225', 'Brooklyn, NY', NULL, 'ASCAP', '2015-01-30', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R41', 'Marc', 'VonMolnar', 'Marc VonMolnar', '335296847', 'Dingman''s Ferry, PA', NULL, 'ASCAP', '2014-02-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R43', 'Mathias', 'Kunzli', 'Mathias Kunzli', '505057287', 'Pasadena, CA', NULL, 'BMI', '2015-02-16', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R46', 'Martin', 'Briley', 'Martin Briley', '68299725', 'Bloomfield, NJ', NULL, 'ASCAP', '2015-02-04', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R47', 'Danny', 'Roselle', 'Danny Roselle', '581318645', 'Summit, NJ', NULL, 'ASCAP', '2015-02-10', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R49', 'Michael', 'Koch', 'Michael Koch', '282791728', 'Paderborn, GERMANY', NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R50', 'Matt', 'Filler', 'Matt Filler', '510394092', 'Brooklyn, NY', NULL, 'ASCAP', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R51', 'Matt', 'Hendricks', 'Matt Hendricks', '747955979', NULL, NULL, 'ASCAP', '2015-06-25', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R52', 'Fernando', 'Aponte', 'Fernando Aponte', '759851291', 'Long Beach, NY', NULL, 'ASCAP', '2015-01-30', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R53', 'Douglas', 'Hall', 'Douglas W. Hall', '135409684', 'Montclair, NJ', NULL, 'SESAC', '2015-05-08', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R54', 'Philip', 'Horn', 'Philip Horn', '773529117', 'Monroe, NY', NULL, 'BMI', '2015-08-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R55', 'Joshua', 'Harter', 'Joshua Harter', '528694414', 'San Antonio, TX', NULL, 'ASCAP', '2015-07-22', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R57', 'Kyle', 'Querec', 'Kyle Querec', '481294344', 'Grass Valley, CA', NULL, 'ASCAP', '2015-06-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R58', 'David', 'Moreno', 'David Moreno', '772628905', 'Brooklyn, NY', NULL, 'ASCAP', '2015-05-13', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R59', 'Thomas', 'Swindell', 'Thomas Swindell', '484093241', 'London, UK', NULL, 'PRS', '2016-08-31', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R60', 'Eduard', 'Telik', 'Eduard Telik', '708990703', 'Paderborn, GERMANY', NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R61', 'David', 'Mueller', 'David Mueller', '468052936', 'Paderborn, DE', NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R62', 'Sven', 'Zumbrock', 'Sven Zumbrock', '735650437', 'Paderborn, GERMANY', NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R64', 'Florian', 'Mueller', 'Florian Mueller', '735229246', 'Paderborn, GERMANY', NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R66', 'Christopher', 'Toland', 'Christopher Toland', '196031374', 'Northport, NY', NULL, 'BMI', '2015-11-08', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R67', 'Emmett', 'O''Malley', 'Emmett O''Malley', '289441429', 'Los Angeles, CA', NULL, 'BMI', '2015-06-17', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R69', 'Ken', 'Ramm', 'Ken Ramm', '43488962', 'Toronto, CANADA', NULL, 'SOCAN', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R73', 'Juan', 'Masotta', 'Juan Masotta', '492323455', 'Buenos Aires, Argentina', NULL, 'BMI', '2014-05-01', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R75', 'James', 'Richardson', 'James Richardson', '612101222', 'Brooklyn, NY', NULL, 'SESAC', '2014-11-10', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('X76', 'Pete', 'Palestina', 'Pete Palestina', '535605654', NULL, NULL, 'BMI', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('X77', 'Geoff', 'Deitch', 'Geoff Deitch', '760680140', NULL, NULL, 'BMI', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R78', 'Jonathan', 'Vergara', 'Jonathan Vergara', '612227978', NULL, NULL, 'ASCAP', '2014-10-22', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R79', 'Matthew', 'Stein', 'Matthew Stein', '194213966', NULL, NULL, 'BMI', '2016-04-27', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R81', 'Andrew', 'Shoniker', 'Andrew Shoniker', '685689472', NULL, NULL, 'SOCAN', '2014-07-15', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R83', 'Tim', 'Barr', 'Tim Barr', '515795039', NULL, NULL, 'BMI', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R85', 'Eric', 'Nolan', 'Eric Nolan', '744461635', 'New York, NY', NULL, 'BMI', '2014-10-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R86', 'Tamara', 'Kachelmeier', 'Tamara Kachelmeier', '677144030', NULL, NULL, 'ASCAP', '2015-07-29', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R87', 'Armin', 'Solo', 'Armin Solo', '779534095', NULL, NULL, 'ASCAP', '2016-03-15', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R90', 'Luis', 'Torres', 'Luis Ricardo Torres', '612993535', NULL, 'Ricardo', 'SESAC', '2015-12-17', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R91', 'Christopher', 'Paulson', 'Christopher Paulson', '716261066', NULL, NULL, 'SOCAN', '2016-03-01', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R95', 'Ryan', 'Foss', 'Ryan Foss', '777844284', NULL, NULL, 'ASCAP', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R13', 'Ben', 'Zwerin', 'Ben Zwerin', '451532478', 'Brooklyn, NY', NULL, 'ASCAP', '2014-03-27', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R42', 'William', 'Sullivan', 'William Sullivan', '516587237', NULL, NULL, 'ASCAP', '2015-09-11', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S37', 'Samuel', 'Skinner', 'Samuel Skinner', '573759898', NULL, NULL, 'BMI', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R45', 'Toshi', 'Trebess', 'Toshi Trebess', '242172006', NULL, NULL, 'GEMA', '2015-08-18', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R17', 'Kembo', 'Cheng', 'Kembo Cheng', '778470001', 'Orenjestad, ARUBA', NULL, 'ASCAP', '2015-08-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R84', 'Henry', 'Sullivant', 'Henry Sullivant', '476539903', 'Athens, GA', NULL, 'ASCAP', '2015-09-16', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R19', 'Jonathan', 'Krimstock', 'Jonathan Krimstock', '339679018', 'New York, NY', NULL, 'ASCAP', '2015-12-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S23', 'Michael', 'Levine', 'Michael Levine', '336631762', NULL, NULL, 'ASCAP', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R08', 'William', 'Eisele', 'William Eisele', '209327774', NULL, NULL, 'BMI', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S20', 'Bill', 'Maier', 'Bill Maier', '181950851', 'Nashville, TN', NULL, 'ASCAP', '2015-12-23', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S21', 'James', 'Mulvale', 'James Mulvale', '678099095', 'Toronto, CANADA', NULL, 'SOCAN', '2015-01-09', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S22', 'Raphael', 'McGregor', 'Raphael McGregor', '549934994', NULL, NULL, 'ASCAP', '2015-10-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('Z40', 'Michael', 'Flannery', 'Michael Sean Flannery', '348685907', NULL, 'Sean', 'ASCAP', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S24', 'Ethan', 'Meixsell', 'Ethan Meixsell', '514451186', 'Northport, NY', NULL, 'BMI', '2015-10-27', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S28', 'Travis', 'Bacon', 'Travis Bacon', '550141388', NULL, NULL, 'BMI', '2015-12-22', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S26', 'Achim', 'Fischer', 'Achim Fischer', '249079245', NULL, NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R24', 'Anthony', 'Shipman', 'Anthony Shipman', '358819906', NULL, NULL, 'BMI', '2015-12-24', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S19', 'Julie', 'Collings', 'Julie Collings', '489150035', 'Derbyshire, UK', NULL, 'BMI', '2016-03-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S18', 'Eric', 'Liljestrand', 'Eric Liljestrand', '193960240', NULL, NULL, 'BMI', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R76', 'Darren', 'Smith', 'Darren Smith', '504069087', 'Los Angeles, CA', NULL, 'SESAC', '2016-03-26', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R63', 'Mark', 'Marshall', 'Mark Marshall', '553341859', 'Brooklyn, NY', NULL, 'ASCAP', '2016-04-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R65', 'Benjamin', 'Jacobs', 'Benjamin Jacobs', '587049707', NULL, NULL, 'BMI', '2016-04-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R70', 'Matthew', 'Hollingsworth', 'Matthew Hollingsworth', '646597204', NULL, NULL, 'ASCAP', '2016-05-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R71', 'Taylor', 'McLam', 'Taylor McLam', '341161207', NULL, NULL, 'ASCAP', '2016-05-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R48', 'Michael', 'Toland', 'Michael Toland', '339072755', 'Oxnard, CA', NULL, 'ASCAP', '2015-06-23', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R74', 'Emiko', 'Carlin', 'Emiko Carlin', '289661607', NULL, NULL, 'ASCAP', '2016-05-26', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R72', 'Marco', 'Pesci', 'Marco Pesci', '559673006', NULL, NULL, 'BMI', '2016-05-26', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R80', 'Clarke', 'Oler', 'Clarke Kim Oler', '120775592', NULL, 'Kim', 'BMI', '2016-06-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R93', 'Adonis', 'Tsilimparis', 'Adonis Tsilimparis', '336947529', NULL, NULL, 'ASCAP', '2016-06-13', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R96', 'Steven', 'Faile', 'Steven Faile', '469623713', NULL, NULL, 'BMI', '2016-06-13', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R68', 'Alexander', 'Wittkowski', 'Alexander Wittkowski', '525597330', 'Berlin, GERMANY', NULL, 'GEMA', '2016-06-16', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R97', 'Jake', 'Warren', 'Jake Warren', '573174050', NULL, NULL, 'PRS', '2016-06-17', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R77', 'Daniel', 'Chait', 'Daniel Chait', '565207157', NULL, NULL, 'ASCAP', '2016-06-15', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R98', 'Stephen', 'Bigger', 'Stephen Bigger', '189798580', NULL, NULL, 'ASCAP', '2016-07-11', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R99', 'Leah', 'Paul', 'Leah Paul', '601921190', NULL, NULL, 'BMI', '2016-07-11', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S27', 'Darko', 'Saric', 'Darko Saric', '421161213', 'New York, NY', NULL, 'ASCAP', '2016-08-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S29', 'David', 'Barenboim', 'David Barenboim', '454864721', NULL, NULL, 'GEMA', '2016-08-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R89', 'Mark', 'Roos', 'Mark Roos', '337948716', 'Brooklyn, NY', NULL, 'ASCAP', '2016-08-08', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R44', 'Taylor', 'Carson', 'Taylor Carson', '349228642', NULL, NULL, 'ASCAP', '2016-08-31', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P10', 'Wolfgang', 'Setik', 'Wolfgang Setik', '245650764', NULL, NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P11', 'Stephan', 'Moritz', 'Stephan Moritz', '287516041', NULL, NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P12', 'Tobias', 'Burger', 'Tobias Burger', '265664048', NULL, NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P13', 'Michael', 'Kadelbach', 'Michael Kadelbach', '271717757', NULL, NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P14', 'Michael', 'Shaaf', 'Michael Shaaf', '210926400', NULL, NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P15', 'Peter', 'Riese', 'Peter Riese', '225726179', NULL, NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P16', 'John', 'Kewen', 'John Kewen', '89946700', NULL, NULL, 'SUISA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P17', 'Nepomuk', 'Heller', 'Nepomuk Heller', '549787583', NULL, NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('X59', 'Marcus', 'VonRittberg', 'Marcus VonRittberg', '579405906', NULL, NULL, 'ASCAP', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R88', 'Fima', 'Ephron', 'Fima Ephron', '244357274', NULL, NULL, 'BMI', '2016-10-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R94', 'Jeff', 'McQuilkin', 'Jeff McQuilkin', '424081979', 'Brooklyn, NY', NULL, 'ASCAP', '2016-10-06', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R40', 'Richard', 'Webster', 'Richard Webster', '464553540', NULL, NULL, 'ASCAP', '2016-10-11', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R92', 'Sara', 'Barone', 'Sara Barone', '821027481', NULL, NULL, 'ASCAP', '2016-10-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S11', 'Russ', 'Brown', 'Russ Brown', '1232499159', 'Brooklyn, NY', NULL, 'ASCAP', '2024-04-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S12', 'Joseph', 'Rusnak', 'Joseph Rusnak', '504621489', 'Los Angeles, CA', NULL, 'BMI', '2024-04-17', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S13', 'Omar', 'Blyde', 'Omar Blyde', '1130035918', 'Miami, FL', NULL, 'BMI', '2024-04-17', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S14', 'David', 'Contarino', 'David Contarino', '1190559050', 'Los Angeles, CA', NULL, 'BMI', '2024-05-23', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S15', 'Carla', 'D''Amore', 'Carla D''Amore', '363443563', 'Brighton, UK', NULL, 'PRS', '2024-04-02', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('Z88', 'Brendan', 'Berry', 'Brendan Berry', '561004494', NULL, NULL, 'ASCAP', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('Z92', 'John', 'Moore', 'John Moore', '713296547', NULL, NULL, 'ASCAP', '2015-06-20', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S30', 'Philip', 'D�Agostino', 'Philip D�Agostino', '572316456', NULL, NULL, 'ASCAP', '2016-11-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S33', 'Peter', 'Lobo', 'Peter Lobo', '476561915', 'Rego Park, NY', NULL, 'ASCAP', '2016-11-14', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S36', 'Dong', 'Liu', 'Dong Liu', '734055262', NULL, NULL, 'ASCAP', '2016-11-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S32', 'Ronald', 'Passaro', 'Ronald Passaro', '340503407', NULL, NULL, 'ASCAP', '2016-11-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S34', 'Danny', 'Gray', 'Danny Gray', '467297019', NULL, NULL, 'ASCAP', '2016-11-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S38', 'Jimmie', 'Williams', 'Jimmie Williams', '341923964', NULL, NULL, 'ASCAP', '2016-11-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S31', 'Mark', 'Taylor', 'Mark Taylor', '337161083', NULL, NULL, 'ASCAP', '2016-11-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S39', 'Joanne', 'Harris', 'Joanne Harris', '575913319', NULL, NULL, 'ASCAP', '2016-11-17', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S40', 'Christopher', 'North', 'Christopher North', '183270572', NULL, NULL, 'BMI', '2016-11-18', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S41', 'Ryan', 'Nach', 'Ryan Nach', '621624770', NULL, NULL, 'ASCAP', '2016-11-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S42', 'Michael', 'Kenny', 'Michael Kenny', '87221867', NULL, NULL, 'BMI', '2016-11-23', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S43', 'Greg', 'Pliska', 'Greg Pliska', '465967991', NULL, NULL, 'ASCAP', '2016-11-28', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S44', 'Peter', 'Min', 'Peter Min', '335592844', NULL, NULL, 'ASCAP', '2016-11-28', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S45', 'Danielle', 'Merlis', 'Danielle Merlis', '751817922', NULL, NULL, 'ASCAP', '2016-11-29', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R82', 'Steve', 'Mayone', 'Steve Mayone', '291601378', 'Brooklyn, NY', NULL, 'SESAC', '2014-09-18', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S46', 'Lou', 'Hill', 'Lou Hill', '503936657', NULL, NULL, 'BMI', '2016-12-16', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R56', 'Matthew', 'Trivigno', 'Matthew Trivigno', '643293543', NULL, NULL, 'ASCAP', '2015-05-29', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S47', 'Kevin', 'Shoemaker', 'Kevin Shoemaker', '776201538', NULL, NULL, 'ASCAP', '2017-01-13', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S48', 'Mark', 'Williams', 'Mark Williams', '347476630', NULL, NULL, 'ASCAP', '2017-01-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S49', 'Richard', 'Jay', 'Richard Jay', '346555544', 'New York, NY', NULL, 'ASCAP', '2017-01-24', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S50', 'Shawn', 'Russell', 'Shawn Russell', '649719104', NULL, NULL, 'ASCAP', '2017-01-24', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S51', 'Andrew', 'Barlow', 'Andrew Barlow', '422448966', NULL, NULL, 'ASCAP', '2017-02-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S52', 'Kembo', 'Cheng', 'Kembo Cheng', '778470001', NULL, NULL, 'ASCAP', '2017-02-08', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S54', 'Stylianos', 'Kalisperides', 'Stylianos Michael Kalisperides', '295973207', NULL, 'Michael', 'ASCAP', '2017-03-15', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R05', 'Thomas', 'Barth', 'Thomas Barth', '765263129', NULL, NULL, 'ASCAP', '2017-04-25', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R20', 'Christopher', 'Botta', 'Christopher Botta', '728308633', NULL, NULL, 'BMI', '2015-05-11', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S55', 'Jonathan', 'Foy', 'Jonathan Foy', '631128972', NULL, NULL, 'BMI', '2017-04-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S56', 'Daniel', 'Hollman', 'Daniel Hollman', '218160984', NULL, NULL, 'BMI', '2017-05-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P18', 'Jonas', 'Krag', 'Jonas Krag', '2199469446', NULL, NULL, 'KODA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S57', 'James', 'Klein', 'James Klein', '143375286', NULL, NULL, 'ASCAP', '2017-05-04', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S58', 'Paul', 'Mitch', 'Paul Mitch', '495988273', NULL, NULL, 'BMI', '2017-05-08', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S59', 'Maya', 'Solovey', 'Maya Solovey', '479009824', NULL, NULL, 'SESAC', '2017-05-09', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S60', 'Steve', 'Carter', 'Steve Carter', '613856835', 'West Mahwah, NJ', NULL, 'BMI', '2017-05-30', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S61', 'Peter', 'Cornell', 'Peter Cornell', '822478824', NULL, NULL, 'ASCAP', '2017-08-10', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S62', 'Jonathan', 'Gordon', 'Jonathan Gordon', '57988318', NULL, NULL, 'BMI', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S63', 'Jonathan', 'Ososki', 'Jonathan Ososki', '474468225', NULL, NULL, 'ASCAP', '2017-08-18', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S64', 'Gregory', 'Douglass', 'Gregory Douglass', '513578746', NULL, NULL, 'BMI', '2017-08-29', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S65', 'Ariel', 'Marx', 'Ariel Marx', '747263327', NULL, NULL, 'ASCAP', '2017-08-28', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S66', 'Michael', 'Aharon', 'Michael Aharon', '243682268', NULL, NULL, 'SESAC', '2017-10-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S67', 'David', 'Anson', 'David Anson', '702639751', NULL, NULL, 'PRS', '2017-10-10', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S68', 'Wagner', 'Previato', 'Wagner Previato', '507851449', NULL, NULL, 'ASCAP', '2017-10-27', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S69', 'Ronnie', 'Lawson', 'Ronnie Lawson', '246120400', NULL, NULL, 'BMI', '2017-11-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S70', 'Jeffrey', 'Schiller', 'Jeffrey Schiller', '453688227', NULL, NULL, 'ASCAP', '2018-01-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S71', 'Troy', 'Engle', 'Troy Engle', '358693216', NULL, NULL, 'BMI', '2018-01-29', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('P19', 'Tim', 'Nowack', 'Tim Nowack', '254482167', NULL, NULL, 'GEMA', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S72', 'Matthew', 'Owens', 'Matthew Owens', '425162581', NULL, NULL, 'PRS', '2018-02-19', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C27', 'Aaron', 'Saloman', 'Aaron Saloman', '290230885', 'Montreal, CANADA', NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C28', 'Aldo', 'Shllaku', 'Aldo Shllaku', '280316191', NULL, NULL, 'BMI', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C29', 'Andrew', 'Stamp', 'Andrew Stamp', '755933309', NULL, NULL, 'PRS', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C30', 'Elaine', 'Gallant', 'Elaine Gallant', '836654215', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C31', 'Garett', 'Schmidt', 'Garett Schmidt', '96964095', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C32', 'Hugo', 'McLaughlin', 'Hugo McLaughlin', '296552820', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C33', 'James', 'Godden', 'James Atin-Godden', '683911616', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C34', 'Jordan', 'Allen', 'Jordan Allen', '587916392', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C47', 'Justin', 'Meli', 'Justin Meli', '637706038', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C35', 'Kevin', 'Wideman', 'Kevin Wideman', '666148815', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C36', 'Mathieu', 'Vachon', 'Mathieu Vachon', '531252491', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C37', 'Medhat', 'Hanbali', 'Medhat Hanbali', '683461523', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C38', 'Michael', 'Reinmueller', 'Michael Reinmueller', '45586363', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C39', 'Mitch', 'Lee', 'Mitch Lee', '459066725', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C40', 'Nathalie', 'Bonin', 'Nathalie Bonin', '270312896', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C41', 'Nicolas', 'Sylvestre', 'Nicolas Sylvestre', '577555305', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C42', 'Rahul', 'Shah', 'Rahul Shah', '774282417', NULL, NULL, 'BMI', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C43', 'Scott', 'Thompson', 'Scott Thompson', '737885489', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C44', 'Sean', 'Goldman', 'Sean Goldman', '869200424', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C45', 'Simon', 'Poole', 'Simon Poole', '460154287', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C46', 'Yanni', 'Caldas', 'Yanni Caldas', '820646452', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C48', 'Konstantine', 'Aivaliotis', 'Konstantine Aivaliotis', '684988466', NULL, NULL, 'SOCAN', '2018-03-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C49', 'Kevin', 'Won', 'Kevin Won', '804556737', NULL, NULL, 'SOCAN', '2018-03-08', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S73', 'Eddie', 'Grey', 'Eddie Grey', '716903245', NULL, NULL, 'ASCAP', '2018-03-09', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C50', 'Remy', 'Perrin', 'Remy Perrin', '566062642', NULL, NULL, 'BMI', '2018-03-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('Y01', 'Erik', 'Steinert', 'Erik Steinert', '111222333', NULL, NULL, 'ASCAP', NULL, false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C55', 'Marie', 'Bourdon', 'Marie-Christine Bourdon', '796220617', 'CANADA', NULL, 'SOCAN', '2018-04-27', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C52', 'Ken', 'Vandevrie', 'Ken Vandevrie', '226456176', NULL, NULL, 'SOCAN', '2018-03-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C53', 'James', 'Sheehan', 'James Sheehan', '609921534', NULL, NULL, 'SOCAN', '2018-03-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C54', 'Sean', 'Croley', 'Sean Croley', '226013120', NULL, NULL, 'SOCAN', '2018-03-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C51', 'Paul', 'Levasseur', 'Paul Levasseur', '871163927', 'Manitoba, Canada', NULL, 'SOCAN', '2018-04-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R06', 'Scot', 'Manwiller', 'Scot Manwiller', '182664550', 'Reading, PA', NULL, 'BMI', '2018-06-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S75', 'Jake', 'Atherton', 'Jake Atherton', '888010422', 'New York', NULL, 'ASCAP', '2018-09-18', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S74', 'Justin', 'Rosin', 'Justin Rosin', '635066257', 'Westfield, NJ', NULL, 'BMI', '2018-07-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S76', 'Marcus', 'Rittberg', 'Marcus Von Rittberg', '579405906', 'Los Angeles, CA', NULL, 'ASCAP', '2018-09-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S77', 'Jesse', 'Baskin', 'Jesse Baskin', '767236022', 'New York, NY', NULL, 'BMI', '2018-10-17', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S78', 'Joanna', 'Iwanowicz', 'Joanna Iwanowicz', '634874715', 'New York, NY', NULL, 'ASCAP', '2019-01-19', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C56', 'Colin', 'Ford', 'Colin Andrew Ford', '97054181', 'Vancouver, BC, Canada', 'Andrew', 'SOCAN', '2019-03-18', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S79', 'Irv', 'Johnson', 'Irv Johnson', '223528881', 'Brooklyn, NY', NULL, 'BMI', '2019-03-31', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S80', 'Nicholas', 'Tyler', 'Nicholas Jonathan Tyler', '420236211', 'Brooklyn, NY', 'Jonathan', 'ASCAP', '2019-03-30', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S82', 'Christopher', 'Johanson', 'Christopher Johanson', '371276753', 'West Hartford, CT', NULL, 'BMI', '2019-05-16', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C57', 'Roy', 'Oommen', 'Roy Oommen', '531236193', 'Mississaugua, Ontario, Canada', NULL, 'SOCAN', '2019-05-24', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S84', 'Braden', 'Miller', 'Braden Miller', '502865169', 'Pasadena, CA', NULL, 'ASCAP', '2019-06-11', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S86', 'Jeff', 'Miller', 'Jeff Miller', '339529239', 'Reading, PA', NULL, 'ASCAP', '2019-07-19', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S85', 'Heide', 'Weisse', 'Heide Weisse', '385591322', 'Muenster, Germany', NULL, 'ASCAP', '2019-07-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S83', 'Ian', 'Cooney', 'Ian Cooney', '56517963', 'Del Rey Beach, FL', NULL, 'ASCAP', '2019-07-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S87', 'Jacob', 'Turner', 'Jacob Turner', '674031066', 'Los Angeles, CA', NULL, 'BMI', '2019-08-22', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S88', 'Sam', 'Campoli', 'Sam Campoli', '1002917797', NULL, NULL, 'ASCAP', '2019-10-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S89', 'Robert', 'Critchley', 'Robert Critchley', '135336196', 'Canada', NULL, 'SOCAN', '2019-11-19', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R07', 'Renee', 'Cologne', 'Renee Cologne', '253824269', 'Yardley, PA', NULL, 'ASCAP', '2020-02-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C58', 'Tim', 'Mann', 'Tim Mann', '471114682', 'CANADA', NULL, 'SOCAN', '2020-03-18', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S90', 'Kevin', 'Farrell', 'Kevin Farrell', '510471200', NULL, NULL, 'ASCAP', '2020-03-23', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S81', 'Sebastian', 'Sprenger', 'Sebastian Arno Sprenger', '785210144', 'Berlin, Germany', 'Arno', 'GEMA', '2020-05-26', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S91', 'Jonathan', 'Gejtman', 'Jonathan Gejtman', '640084082', 'Buenos Aires, Argentina', NULL, 'SADAIC', '2020-10-10', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S96', 'John', 'Landells', 'John Landells', '1003777679', 'England', NULL, 'PRS', '2020-12-15', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S97', 'Katherine', 'Beggs', 'Katherine Beggs', '849236310', 'Los Angeles', NULL, 'ASCAP', '2021-01-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T73', 'Eddie', 'Grey', 'Eddie Grey', '716903245', 'Sherman Oaks, CA', NULL, 'ASCAP', '2021-01-11', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S94', 'Daniel', 'Brenner', 'Daniel Brenner', '694553', 'Germany', NULL, 'GEMA', '2021-02-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S98', 'Kyle', 'Butman', 'Kyle Butman', '1075514563', 'Colorado', NULL, 'ASCAP', '2021-01-31', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S17', 'Duke', 'Bojadziev', 'Duke Bojadziev', '161071014', 'EU', NULL, 'ASCAP', '2021-02-25', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S99', 'Anson', 'Olds', 'Anson Olds', '384055357', 'Lennox, MA', NULL, 'ASCAP', '2021-03-04', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T02', 'Robin', 'Miller', 'Robin Lewis Miller', '417647642', 'Los Angelis, CA', 'Lewis', 'ASCAP', '2021-04-06', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T01', 'Rouvaun', 'Roman', 'Rouvaun Roman', '488510331', 'Los Angelis', NULL, 'ASCAP', '2021-04-06', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T03', 'Alex', 'Whalen', 'Alex Whalen', '819361819', NULL, NULL, 'BMI', '2021-06-03', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T04', 'Anthony', 'Bernardo', 'Anthony Bernardo', '485489201', 'Northampton, MA', NULL, 'ASCAP', '2021-06-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T05', 'Juan', 'Arango', 'Juan Esteban Arango', '359193823', 'Brooklyn, NY', 'Esteban', 'BMI', '2021-07-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R03', 'Stephen', 'Hoevertsz', 'Stephen Hoevertsz', '288542133', 'West Palm, FL', NULL, 'SESAC', '2021-07-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T07', 'Tamara', 'Miller', 'Tamara Miller', '433229674', 'Huntingdon Valley, CA', NULL, 'SOCAN', '2021-08-31', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T08', 'Doug', 'Hinrichs', 'Doug Hinrichs', '476757698', 'New Jersey', NULL, 'BMI', '2021-09-22', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T06', 'Luca', 'Poloni', 'Luca Poloni', '886354394', 'UK', NULL, 'PRS', '2021-09-17', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T10', 'Terry', 'Gorka', 'Terry Allen Gorka', '32124239', 'CALIFORNIA', 'Allen', 'BMI', '2021-10-25', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T09', 'Steven', 'Farella', 'Steven Farella', '344012800', NULL, NULL, 'ASCAP', '2021-10-28', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T11', 'Devin', 'Bing', 'Devin Bing', '578982573', 'LA,CA', NULL, 'BMI', '2021-11-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T15', 'Rasheen', 'Smith', 'Rasheen Smith', '668726101', 'Kingston, NY', NULL, 'BMI', '2022-05-09', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T13', 'Royce', 'Manwiller', 'Royce Manwiller', '894000835', 'Reading, PA', NULL, 'BMI', '2022-06-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T18', 'Christoph', 'Kuplien', 'Christoph Kuplien', '387814024', NULL, NULL, 'SOCAN', '2022-07-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T17', 'Nah''Shon', 'Alexander', 'Nah''Shon Alexander', '1126312009', 'Colorado', NULL, 'BMI', '2022-07-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T19', 'Semih', 'Yanyali', 'Semih Yanyali', '822432956', 'New York, NY', NULL, 'ASCAP', '2022-08-10', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T16', 'Kionne', 'Smith', 'Kionne Smith', '1029912168', NULL, NULL, 'BMI', '2022-03-23', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T21', 'Alec', 'Jordan', 'Alec Jordan', '1152065393', 'Massachussetts', NULL, 'ASCAP', '2022-09-13', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T20', 'Henrik', 'Regel', 'Henrik Regel', '0019758837', 'Berlin, DEUTSCHLAND', NULL, 'GEMA', '2022-09-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T22', 'Sean', 'Hayden', 'Sean Hayden', '580193056', 'Toronto, CANADA', NULL, 'SOCAN', '2022-10-31', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T23', 'Hasan', 'Kankizil', 'Hasan Kankizil', '1035475', 'Germany', NULL, 'GEMA', '2022-11-29', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T24', 'Tristan', 'Sullivan', 'Tristan Luke Sullivan', '544045275', 'Amherst, MA', 'Luke', 'ASCAP', '2022-12-19', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T25', 'John', 'Nixon', 'John Matthew Nixon', '25776127', NULL, NULL, 'SOCAN', '2023-04-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T27', 'David', 'Vidal', 'David Vidal', '1121567389', 'Cocoa, FL', NULL, 'BMI', '2023-08-30', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T28', 'Ryan', 'Welch', 'Ryan Welch', '195949209', 'West Hollywood, CA', NULL, 'BMI', '2023-08-30', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T29', 'Murphy', 'Smith', 'Murphy Smith', '1145204200', 'Minneapolis, MN', NULL, 'BMI', '2023-08-31', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T30', 'Marion', 'Henry', 'Marion Henry', '1087858994', 'Pflugerville, TX', NULL, 'ASCAP', '2023-08-31', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T31', 'Jared', 'Kahn', 'Jared Kahn', '615644647', 'Culver City, CA', NULL, 'BMI', '2023-09-01', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T32', 'Matt', 'Maroulakos', 'Matt Maroulakos', '550144505', 'Los Angeles, CA', NULL, 'BMI', '2023-09-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T33', 'Ryan', 'Redebaugh', 'Ryan Redebaugh', '737482809', 'Glendale, Ca', NULL, 'ASCAP', '2023-09-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T34', 'Matt', 'Wilcox', 'Matt Wilcox', '342042211', 'Portland, OR', NULL, 'ASCAP', '2023-09-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T35', 'William', 'Vosburg', 'William Bradley Vosburg', '187026560', 'Fairview, TN', 'Bradley', 'BMI', '2023-09-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T36', 'David', 'Gyamera', 'David Gyamera', '790117347', 'London, UK', NULL, 'PRS', '2023-09-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T37', 'Julio', 'Mazzeu', 'Julio Mazzeu', '1187776300', 'Lisbon, Portugal', NULL, 'SPA', '2023-09-12', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T38', 'Alin', 'Popescu', 'Alin Constantin-Popescu', '733803352', 'Romania', NULL, 'UCMR-ADA', '2023-09-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T39', 'Rasmus', 'Zschoch', 'Rasmus Zschoch', '854987376', 'Wuppertal, GERMANY', NULL, 'GEMA', '2023-09-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T40', 'Jordan', 'Whaley', 'Jordan Whaley', '730665644', 'Los Angeles, CA', NULL, 'BMI', '2023-09-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C59', 'Aaron', 'Dunn', 'Aaron Dunn', '675164034', 'Virginia Beach, VA', NULL, 'SOCAN', '2023-09-21', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T41', 'Stian', 'Ved�y', 'Stian Ved�y', '719139041', 'Bristol, UK', NULL, 'PRS', '2023-09-27', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T42', 'Jason', 'Donnelly', 'Jason Donnelly', '429943522', 'Redondo Beach, CA', NULL, 'BMI', '2023-09-27', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T43', 'Mardoch�', 'Ndombasi', 'Mardoch� Lukombo Ndombasi', '1183378688', 'Moissy, France', 'Lukombo', 'SACEM', '2023-09-28', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T44', 'Gillian', 'Orwoll', 'Gillian Orwoll', '1048479238', 'Brooklyn, NY', NULL, 'BMI', '2023-09-29', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C60', 'Trevor', 'Lewington', 'Trevor Lewington', '457148734', 'London, Ontario', NULL, 'SOCAN', '2023-10-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T45', 'Trevor', 'Barnes', 'Trevor Barnes', '887180398', 'Jacksonville, FL', NULL, 'ASCAP', '2023-12-05', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T46', 'Paul', 'Micca', 'Paul Micca', '1128605176', 'Brooklyn, NY', NULL, 'ASCAP', '2023-12-08', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T47', 'Ricky', 'Walker', 'Ricky Walker', '429758807', 'Kissimmee, FL', NULL, 'BMI', '2023-12-08', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T48', 'Pascal', 'Zumaque', 'Pascal Zumaque', '455964514', 'Helmetts, NJ', NULL, 'BMI', '2024-01-31', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T49', 'Kendall', 'Barwick', 'Kendall Barwick', '553404973', 'Marina Del Rey, Ca', NULL, 'ASCAP', '2024-02-14', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('S16', 'Pierce', 'Constanti', 'Pierce Constanti', '391149845', NULL, NULL, 'ASCAP', '2021-03-11', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T50', 'Anthony', 'Fuscaldo', 'Anthony Fuscaldo', '674837697', 'Bayonne, NJ', NULL, 'ASCAP', '2024-05-09', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T51', 'Thomas', 'Hoffmann', 'Thomas Hoffmann', '550758244', 'Germany', NULL, 'GEMA', '2024-08-07', true)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('C61', 'Joseph', 'Citivella', 'Joseph Citivella', '202953590', 'Ottawa, Ontario CANADA', NULL, 'SOCAN', '2024-10-07', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('R02', 'Miles', 'Kennedy', 'Miles Kennedy', '358812437', 'Los Angeles, CAA', NULL, 'ASCAP', '2025-01-22', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T52', 'Soren', 'Smedvig', 'Soren Smedvig', '01206537377', 'Housatonic. Ma', NULL, 'BMI', '2025-04-16', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T53', 'Elna', 'Bukvic', 'Elna Bukvic', '550831162', 'BOSNIA', NULL, 'BMI', '2025-11-06', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T54', 'Randall', 'Shattuck', 'Randall Shattuck', '524944247', 'Petoskey, MI', NULL, 'ASCAP', '2026-01-20', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T55', 'Jeffrey', 'Richardi', 'Jeffrey Richardi', '860236252', 'Hermitage, TN', NULL, 'BMI', '2026-02-06', false)
  ON CONFLICT (composer_id) DO NOTHING;
INSERT INTO composers (composer_id, first_name, last_name, full_name, ipi_number, location, middle_name, pro, date_added, is_jup)
  VALUES ('T56', 'Patrick', 'Tallerico', 'Patrick Tallerico', '6288779593', 'Los Angeles, CA', NULL, 'ASCAP', '2026-03-09', false)
  ON CONFLICT (composer_id) DO NOTHING;

-- ── SEED COWRITERS ───────────────────────────────────────────
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Aaron Di Piazza', '732724058', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Aaron Di Piazza');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Aaron Dunn', '675164034', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Aaron Dunn');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Aaron Saloman', '290230885', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Aaron Saloman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Achim Fischer', '247274556', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Achim Fischer');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Adam Daniel Minkoff', '705942833', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Adam Daniel Minkoff');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Adam Iorfida', '858694862', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Adam Iorfida');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Adonis Tsilimparis', '336947529', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Adonis Tsilimparis');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Aldo Shllaku', '280316191', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Aldo Shllaku');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Alex Whalen', '819361819', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Alex Whalen');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Alex Wong', '439767800', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Alex Wong');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Alexander Bernhardt Spiegelman', '600988249', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Alexander Bernhardt Spiegelman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Alexander Sherba', '758129709', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Alexander Sherba');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Alexander Wittkowski', '525597330', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Alexander Wittkowski');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Amber Rubarth', '465956211', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Amber Rubarth');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Amy Marie Layou', '396038729', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Amy Marie Layou');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Andreas Bruhn', '241583478', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Andreas Bruhn');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Andrew Barlow', '422448966', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Andrew Barlow');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Andrew Hind', '871578104', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Andrew Hind');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Andrew Osborn', '506178755', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Andrew Osborn');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Andrew Shoniker', '685689472', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Andrew Shoniker');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Andrew Stamp', '755933309', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Andrew Stamp');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Andrew Stanton', '584342045', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Andrew Stanton');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Angie Dais', '825312461', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Angie Dais');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Anthony Bernardo', '485489201', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Anthony Bernardo');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Anthony Clint, Jr', '564107462', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Anthony Clint, Jr');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Anthony George Balaskas', '508596525', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Anthony George Balaskas');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Anthony Shipman', '358819906', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Anthony Shipman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Aren G. Olsen', '345512281', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Aren G. Olsen');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ari Folman-Cohen', '542161384', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ari Folman-Cohen');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ariel Marx', '747263327', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ariel Marx');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Armin Solo', '779534095', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Armin Solo');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Aron Forbes', '561507166', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Aron Forbes');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Aurore Ounjian', '583877296', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Aurore Ounjian');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Austin Elkington', '753644917', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Austin Elkington');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Bart Warshaw', '648099505', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Bart Warshaw');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ben Loshin', '777088296', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ben Loshin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ben Zwerin', '451532478', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ben Zwerin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Benedetto Caccavale', '496970981', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Benedetto Caccavale');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Benjamin Jacobs', '587049707', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Benjamin Jacobs');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Benjamin William Sturley', '748783781', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Benjamin William Sturley');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Bill Maier', '181950851', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Bill Maier');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Blake Christiana', '484362143', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Blake Christiana');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Bob Brockmann', '428961526', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Bob Brockmann');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Braden Miller', '502865169', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Braden Miller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brandon Adams', '727060850', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brandon Adams');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brandon Brown', '459915409', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brandon Brown');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brandon Duggins', '532136486', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brandon Duggins');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brandon Wilson', '815957407', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brandon Wilson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Braxton Raymond Hicks', '858318799', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Braxton Raymond Hicks');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brendan Berry', '561004494', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brendan Berry');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brenden Berryn', '561004494', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brenden Berryn');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brent Gallant', '496540422', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brent Gallant');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brent Robitaille', '718453140', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brent Robitaille');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brian Fuller', '843899188', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brian Fuller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Bryan Jennings', '503812780', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Bryan Jennings');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Bryant Lowry', '756875093', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Bryant Lowry');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Bryn-Troy Evans', '437473638', 'APRA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Bryn-Troy Evans');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Chaun Horton', '698141607', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Chaun Horton');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Chris Hartway', '507955432', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Chris Hartway');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christopher Bagnole', '352710876', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christopher Bagnole');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christopher Botta', '728308633', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christopher Botta');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christopher Dale Chrisman', '826271145', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christopher Dale Chrisman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christopher Johanson', '371276753', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christopher Johanson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christopher Keene', '530970460', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christopher Keene');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christopher North', '183270572', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christopher North');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christopher Paulson', '716261066', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christopher Paulson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christopher Toland', '196031374', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christopher Toland');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christos Andreou', '605973336', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christos Andreou');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Clark Oler', '120775592', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Clark Oler');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Clarke Kim Oler', '120775592', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Clarke Kim Oler');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Colin Andrew Ford', '97054181', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Colin Andrew Ford');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Cosmos-Sunshine Heidtmann', '730879422', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Cosmos-Sunshine Heidtmann');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Dan Krochmal', '663839211', 'APRA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Dan Krochmal');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Dane Hartsett', '645303954', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Dane Hartsett');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Daniel Alejandro Fernandez', '834639710', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Daniel Alejandro Fernandez');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Daniel Chait', '565207255', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Daniel Chait');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Daniel Chen', '440872068', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Daniel Chen');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Daniel Gray', '467297019', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Daniel Gray');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Daniel Hollman', '218160984', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Daniel Hollman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Daniel Roselle', '581318645', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Daniel Roselle');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Danielle Merlis', '751817922', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Danielle Merlis');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Danny Gray', '467297019', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Danny Gray');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Danny Roselle', '581318645', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Danny Roselle');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Dario Comuzzi', '690243350', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Dario Comuzzi');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Darko Saric', '421161213', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Darko Saric');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Darren Smith', '504069087', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Darren Smith');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David Aaron Burger', '339235752', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David Aaron Burger');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David Anson', '702639751', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David Anson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David Barenboim', '454864721', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David Barenboim');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David Ben-Porat', '494088223', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David Ben-Porat');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David Janus', '611986928', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David Janus');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David John Forlano', '755642029', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David John Forlano');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David McNally', '592715915', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David McNally');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David Moreno', '772628905', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David Moreno');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David Mueller', '468052936', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David Mueller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Dennis Lichtman', '468976580', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Dennis Lichtman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Derek Kintz', '753644819', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Derek Kintz');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Derek Nievergelt', '514607276', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Derek Nievergelt');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Devin Gati', '504250696', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Devin Gati');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Diego Fernando Juantorena', '1018633479', 'SADAIC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Diego Fernando Juantorena');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Dong Liu', '734055262', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Dong Liu');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Douglas W. Hall', '380516', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Douglas W. Hall');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Dylan Owens', '684951499', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Dylan Owens');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Eddie Grey', '716903245', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Eddie Grey');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Eduard Telik', '708990703', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Eduard Telik');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Elaine Gallant', '836654215', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Elaine Gallant');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Emiko Carlin', '289661607', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Emiko Carlin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Emmett Claran O''Malley', '289441429', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Emmett Claran O''Malley');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Emmett O''Malley', '289441429', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Emmett O''Malley');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Eric Liljestrand', '193960240', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Eric Liljestrand');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Eric Nolan', '744461635', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Eric Nolan');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Eric Varnell', '602014123', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Eric Varnell');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Erik Steinert', '129651955', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Erik Steinert');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Erik Wormwood', '591175829', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Erik Wormwood');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Erin Brueggemann', '506747838', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Erin Brueggemann');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ethan Meixsell', '514451186', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ethan Meixsell');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Evan Haymond', '731425860', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Evan Haymond');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Fernando Aponte', '759851291', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Fernando Aponte');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Fima Ephron', '244357274', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Fima Ephron');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Florian Kiermaier', '653754524', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Florian Kiermaier');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Florian Mueller', '735229246', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Florian Mueller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Francisco Perez Mazon', '487232338', 'AKM'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Francisco Perez Mazon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Franco Caviglia', '667653403', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Franco Caviglia');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Frank Funaro', '247274556', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Frank Funaro');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Frank Schwillewski', '254975431', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Frank Schwillewski');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Gail Bushy', '740333082', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Gail Bushy');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Garett Schmidt', '96964095', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Garett Schmidt');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Garrett Thomas Corbran', '849357689', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Garrett Thomas Corbran');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Geoff Deitch', '760680140', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Geoff Deitch');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Greg Pliska', '465967991', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Greg Pliska');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Gregory Douglass', '513578746', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Gregory Douglass');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Gregory Pliska', '465967991', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Gregory Pliska');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Heide Weisse', '385591322', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Heide Weisse');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Henry Sullivant', '476539903', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Henry Sullivant');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Holden Lewis', '547034656', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Holden Lewis');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Hugo McLaughlin', '296552820', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Hugo McLaughlin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ian Cooney', '56517963', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ian Cooney');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ingo Gabriel', '869622883', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ingo Gabriel');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Irv Johnson', '223528881', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Irv Johnson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Irvin Johnson', '223528881', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Irvin Johnson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jacob Lawson', '550319624', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jacob Lawson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jacob Turner', '674031066', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jacob Turner');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jake Atherton', '888010422', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jake Atherton');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jake Rivlin', '643109272', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jake Rivlin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jake Warren', '573174050', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jake Warren');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'James Atin-Godden', '683911616', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'James Atin-Godden');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'James Klein', '143375286', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'James Klein');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'James Mulvale', '67809909', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'James Mulvale');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'James Richardson', '612101222', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'James Richardson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'James Sheehan', '609921534', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'James Sheehan');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'JamesDustin Brayley', '768555489', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'JamesDustin Brayley');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jan Jirasek', '201785784', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jan Jirasek');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jason Mraz', '344456264', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jason Mraz');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jason Reeves', '526741352', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jason Reeves');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jeff McQuilkin', '424081979', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jeff McQuilkin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jeff Miller', '339529239', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jeff Miller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jeffrey McQuilkin', '424081979', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jeffrey McQuilkin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jeffrey Schiller', '453688227', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jeffrey Schiller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jennifer Mulvale', '670386334', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jennifer Mulvale');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jeremiah Bornfield', '550131128', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jeremiah Bornfield');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jeremy Bonarriba', '447601459', 'BUMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jeremy Bonarriba');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jeremy Johnson', '496847193', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jeremy Johnson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jeremy Mendicino', '565167040', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jeremy Mendicino');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jesse Baskin', '767236022', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jesse Baskin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jesse Glick', NULL, 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jesse Glick');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jimmie Williams', '341923964', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jimmie Williams');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Joanna Iwanowicz', '634874715', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Joanna Iwanowicz');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Joanne Harris', '575913319', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Joanne Harris');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Johannes Seywald', '1024089', 'AKM'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Johannes Seywald');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'John Kewen', '89946700', 'SUISA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'John Kewen');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'John Moore', '713296547', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'John Moore');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'JohnJay Moore', '713296547', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'JohnJay Moore');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jon Madof', '355676527', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jon Madof');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonas Krag', '2199469446', 'KODA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonas Krag');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Drury', '516078263', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Drury');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Foy', '631128972', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Foy');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Gejtman', '640084082', 'SADAIC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Gejtman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Gordon', '57988318', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Gordon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Harter', '516552558', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Harter');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Krimstock', '339679018', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Krimstock');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Madof', '355676527', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Madof');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Morrow', '444589328', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Morrow');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Munoz', '550414722', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Munoz');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Ososki', '474468225', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Ososki');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Vergara', '612227978', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Vergara');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Vieira', '523399836', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Vieira');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'JonJoseph Ehlers', '775218421', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'JonJoseph Ehlers');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jordan Allen', '587916392', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jordan Allen');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jordan Trabue', '692404831', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jordan Trabue');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Joshua Harter', '528694414', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Joshua Harter');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Joshua SadlierBrown', '655963011', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Joshua SadlierBrown');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Juan Masotta', '492323455', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Juan Masotta');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Julian Menkin', '738413730', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Julian Menkin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Julie Collings', '489150035', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Julie Collings');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Justin Meli', '637706038', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Justin Meli');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Justin Rosin', '635066257', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Justin Rosin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Justin Shearn', '568403533', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Justin Shearn');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kari Steinert', '230978754', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kari Steinert');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Karl Moore', '572525739', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Karl Moore');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Karlie Bruce', NULL, 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Karlie Bruce');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'KeithAllen Harter', '186785020', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'KeithAllen Harter');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kelley McRae', '680452248', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kelley McRae');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kelli Scarr', '497055912', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kelli Scarr');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kembo Cheng', '778470001', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kembo Cheng');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ken Ramm', '3488962', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ken Ramm');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ken Vandevrie', '226456176', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ken Vandevrie');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kenneth Lamont Washington Jr', '780454430', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kenneth Lamont Washington Jr');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kevin Comden', '601094590', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kevin Comden');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kevin Farrell', '510471200', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kevin Farrell');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kevin Mello', '550404685', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kevin Mello');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kevin Shoemaker', '776201538', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kevin Shoemaker');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kevin Wideman', '666148815', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kevin Wideman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kevin Won', '804556737', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kevin Won');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Khwezi Sifunda', '891121445', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Khwezi Sifunda');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kim Taylor', '478045140', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kim Taylor');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kincheloe Jackson Matthew', '756897079', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kincheloe Jackson Matthew');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kolbrynn Vahn Lowdell', '390222973', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kolbrynn Vahn Lowdell');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Konstantine Aivaliotis', '684988466', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Konstantine Aivaliotis');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kurtis Vandevrie', '1010577798', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kurtis Vandevrie');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kyle Hauser', '512070602', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kyle Hauser');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kyle Querec', '481294344', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kyle Querec');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lars Hesse', '406448956', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lars Hesse');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lars Wallem', '258984', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lars Wallem');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Leah Paul', '601921190', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Leah Paul');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lejon Lewis', '768912886', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lejon Lewis');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Leon Lohmann', '1061750972', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Leon Lohmann');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Linda Draper', '402451602', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Linda Draper');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lizzi Taylor', '683955199', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lizzi Taylor');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Loren Humphrey', '349365336', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Loren Humphrey');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lou Hill', '503936657', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lou Hill');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lucas De Valdivia', '871735903', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lucas De Valdivia');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lucas Villemur', '642269641', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lucas Villemur');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Luis Ricardo Torres', '612993535', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Luis Ricardo Torres');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Marc Pueschl', '364346945', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Marc Pueschl');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Marc VonMolnar', '335296847', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Marc VonMolnar');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Marco Pesci', '559673006', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Marco Pesci');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Marcus Von Rittberg', '579405906', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Marcus Von Rittberg');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Marcus VonRittberg', '579405906', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Marcus VonRittberg');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Marian Szymczk', '14657000', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Marian Szymczk');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Marie-Christine Bourdon', '796220617', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Marie-Christine Bourdon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mario Chow', '778261995', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mario Chow');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mario Lopez', '753644623', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mario Lopez');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mark Marshall', '553341859', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mark Marshall');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mark Roos', '337948716', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mark Roos');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mark Taylor', '337161083', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mark Taylor');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mark Williams', '347476630', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mark Williams');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Martin Briley', '68299725', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Martin Briley');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mathias Kunzli', '505057287', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mathias Kunzli');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mathieu Vachon', '531252491', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mathieu Vachon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matt Filler', '510394092', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matt Filler');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matt Hendricks', '747955979', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matt Hendricks');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matt Kassell', '614319175', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matt Kassell');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matt Keating', '129175470', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matt Keating');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matt Owens', '425162581', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matt Owens');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthew Castelein', '683486797', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthew Castelein');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthew Cusson', '548637807', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthew Cusson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthew Ferrone', '469609213', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthew Ferrone');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthew Filler', '510394092', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthew Filler');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthew Hendricks', '747955979', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthew Hendricks');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthew Hollingsworth', '646597204', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthew Hollingsworth');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthew Owens', '425162581', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthew Owens');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthew Stein', '194213966', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthew Stein');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthew Trivigno', '643293543', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthew Trivigno');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matthias Hauck', '496197303', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matthias Hauck');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Maurice Stute', '906286426', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Maurice Stute');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Maya Solovey', '479009824', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Maya Solovey');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Maya Solovéy', '479010063', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Maya Solovéy');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Medhat Hanbali', '683461523', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Medhat Hanbali');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Melissa Arce', '672604737', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Melissa Arce');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Aharon', '243682268', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Aharon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Glynn Johnson', '217180394', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Glynn Johnson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Holland', '602336685', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Holland');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Kadelbach', '271717757', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Kadelbach');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Kenny', '87221867', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Kenny');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Koch', '282791728', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Koch');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael LaMorte', '3392458465', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael LaMorte');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Levine', '336631762', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Levine');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Norris', '786469378', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Norris');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Reinmueller', '45586363', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Reinmueller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Scott kettner', '485843411', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Scott kettner');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Sean Flannery', '348685907', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Sean Flannery');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Shaaf', '210926400', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Shaaf');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Toland', '339072755', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Toland');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michail Votzaropoulos', '756468794', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michail Votzaropoulos');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michi Besler', '281315580', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michi Besler');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mike Rubino', '346836926', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mike Rubino');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mike Williams', '338929225', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mike Williams');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mitch Lee', '459066725', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mitch Lee');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Mohamad Noor Che’ree', '763756601', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Mohamad Noor Che’ree');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Natasha Tyrimos', '745525040', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Natasha Tyrimos');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Nate Myotte', '807242554', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Nate Myotte');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Nathalie Bonin', '270312896', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Nathalie Bonin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Nepomuk Heller', '549787583', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Nepomuk Heller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Nicholas Jonathan Tyler', '420236211', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Nicholas Jonathan Tyler');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Nicolas Sylvestre', '577555305', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Nicolas Sylvestre');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Oisin O''Malley', '457630051', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Oisin O''Malley');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Olivia Broadfield', '511053509', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Olivia Broadfield');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Olivier Militon', '676016733', 'SACEM'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Olivier Militon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Pablo Andres Bodnar', '873303929', 'SADAIC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Pablo Andres Bodnar');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Paul Levasseur', '871163927', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Paul Levasseur');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Paul Mitch', '495988273', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Paul Mitch');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Pete Palestina', '535605654', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Pete Palestina');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Peter Cornell', '822478824', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Peter Cornell');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Peter Lobo', '476561817', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Peter Lobo');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Peter Min', '335592844', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Peter Min');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Peter Riese', '225726179', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Peter Riese');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Phil Kullmann', '432915367', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Phil Kullmann');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Philip D’Agostino', '572316456', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Philip D’Agostino');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Philip Feit', '531194964', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Philip Feit');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Philip Gibbs', '355737241', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Philip Gibbs');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Philip Horn', '773529117', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Philip Horn');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Pietro Milanesi', '713867036', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Pietro Milanesi');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Quentin Vandevrie', '1059924039', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Quentin Vandevrie');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Rahul Shah', '774282417', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Rahul Shah');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ralf Lippmann', '557926406', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ralf Lippmann');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ramiro Alvarez Sanchez', '847849478', 'SADAIC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ramiro Alvarez Sanchez');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Raphael McGregor', '549934994', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Raphael McGregor');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Rashod Singleton', '621879823', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Rashod Singleton');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Remy Perrin', '566062642', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Remy Perrin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Renee Cologne', '253824269', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Renee Cologne');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Richard Jay', '346555642', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Richard Jay');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Richard Lewis', '477553613', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Richard Lewis');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Richard Webster', '464553540', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Richard Webster');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Robert Critchley', '135336196', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Robert Critchley');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Roberto Joaquin Rodriguez Del Toro', '846645996', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Roberto Joaquin Rodriguez Del Toro');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Rod Morgenstein', '229408564', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Rod Morgenstein');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ronald Passaro', '340503407', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ronald Passaro');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ronnie Lawson', '246120400', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ronnie Lawson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Roy Oommen', '531236193', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Roy Oommen');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Russel Vandevrie', '384727034', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Russel Vandevrie');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Russell Vandevrie', '384727034', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Russell Vandevrie');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ryan Byrne', '782638995', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ryan Byrne');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ryan Foss', '777844284', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ryan Foss');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ryan Nach', '621624770', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ryan Nach');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ryan Trebilcock', '869040712', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ryan Trebilcock');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sam Campoli', '1002917797', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sam Campoli');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Samuel Skinner', '573759898', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Samuel Skinner');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sara Barone', '821027481', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sara Barone');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Scot Manwiller', '182664550', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Scot Manwiller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Scott Neubert', '337352662', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Scott Neubert');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Scott Thompson', '737885489', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Scott Thompson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sean Croley', '226013120', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sean Croley');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sean Dixon', '356114870', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sean Dixon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sean Goldman', '869200424', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sean Goldman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sean Hagon', '550228693', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sean Hagon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sean McMillion', '446247451', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sean McMillion');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sean McMillon', '446247451', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sean McMillon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sebastian Arno Sprenger', '785210144', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sebastian Arno Sprenger');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Semih Kadir Yanyali', '822432956', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Semih Kadir Yanyali');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Senne Van Marissing', '887864163', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Senne Van Marissing');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sergio Silva', '778469961', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sergio Silva');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Shane Spaulding', '567355126', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Shane Spaulding');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Shawn Russell', '649719104', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Shawn Russell');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Shoshana Bean', '560942249', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Shoshana Bean');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Simon Hesselein', '252362094', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Simon Hesselein');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Simon Poole', '460154287', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Simon Poole');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sinisa Itskovich', '282972431', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sinisa Itskovich');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stephan Moritz', '287516041', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stephan Moritz');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stephen Bigger', '189798580', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stephen Bigger');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stephen Doster', '240113137', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stephen Doster');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stephen Hoevertsz', '288542133', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stephen Hoevertsz');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stephen Kellogg', '344682940', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stephen Kellogg');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stephen Skinner', '144989430', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stephen Skinner');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Steve Carter', '613856835', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Steve Carter');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Steve Mayone', '291601378', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Steve Mayone');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Steve Skinner', '144989430', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Steve Skinner');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Steven Faile', '469623713', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Steven Faile');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Steven Farella', '344012800', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Steven Farella');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stylianos Michael Kalisperides', '295973207', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stylianos Michael Kalisperides');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sven Zumbrock', '735650437', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sven Zumbrock');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tamara Kachelmeier', '677144030', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tamara Kachelmeier');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tamera Katchelmeyer', '677144030', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tamera Katchelmeyer');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Taylor Carson', '349228642', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Taylor Carson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Taylor McLam', '341161207', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Taylor McLam');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Terrence Watkin', '510468871', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Terrence Watkin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Theodore Thomas', '496593001', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Theodore Thomas');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Thomas Barth', '143989044', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Thomas Barth');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Thomas Swindell', '484093241', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Thomas Swindell');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Thomas Swindells', '484093241', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Thomas Swindells');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tim Barr', '515795039', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tim Barr');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tim Mann', '471114682', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tim Mann');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tim Nowack', '254482167', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tim Nowack');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tim-Ryan O''Kane', '630951163', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tim-Ryan O''Kane');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Timothy Kvasnosky', '349729026', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Timothy Kvasnosky');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tobias Burger', '265664048', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tobias Burger');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tobias Vogel', '597251024', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tobias Vogel');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Todd Caldwell', '532412883', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Todd Caldwell');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Todd Thibaud', '338420473', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Todd Thibaud');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tony Wilson', '225955846', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tony Wilson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Toshi Trebess', '242172006', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Toshi Trebess');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Travis Bacon', '550141388', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Travis Bacon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Troy Engle', '358693216', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Troy Engle');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ulrich Bannenberg', '702091683', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ulrich Bannenberg');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ulrich Guggenberger', '474680035', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ulrich Guggenberger');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Vitali Ehret', '806596611', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Vitali Ehret');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Wagner Previato', '507851449', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Wagner Previato');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'William Bradley Vosburg', '187026560', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'William Bradley Vosburg');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'William Eisele', '209327774', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'William Eisele');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'William Sullivan', '516587237', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'William Sullivan');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Wolfgang Setik', '245650764', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Wolfgang Setik');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Yanni Caldas', '820646452', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Yanni Caldas');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Yohoshua Fruchter', '766584884', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Yohoshua Fruchter');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Yoshie Fruchter', '766584884', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Yoshie Fruchter');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Zach McNees', '670838911', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Zach McNees');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Daniel Levasseur', '1070647273', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Daniel Levasseur');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Frederic Hau', '456506154', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Frederic Hau');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Kory Leigh Glattman', '756811224', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Kory Leigh Glattman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Rouvan Gus Roman', '488510331', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Rouvan Gus Roman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Steven Wayne Johnson', '816530450', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Steven Wayne Johnson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Robin Lewis Miller', '417647642', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Robin Lewis Miller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Angelina Gargano', '493999376', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Angelina Gargano');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Steven Parry', '548456910', 'SUISA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Steven Parry');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tamara R Miller', '433229674', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tamara R Miller');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sergio Perez Sanchez', '395971205', 'SGAE'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sergio Perez Sanchez');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Seth Ondracek', '1057842348', 'SESAC'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Seth Ondracek');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Daniel Scording', '522748061', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Daniel Scording');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ross Geoffrey Woolridge', '131932986', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ross Geoffrey Woolridge');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Daniel Elias Brenner', '573900050', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Daniel Elias Brenner');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Marvin Benjamin McMahon', '717630251', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Marvin Benjamin McMahon');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tayib Thomas', '01103920503', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tayib Thomas');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Konstantinos Chaveles', '815390736', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Konstantinos Chaveles');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'David Stepan Norris', '760961620', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'David Stepan Norris');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Devin Stepan Norris', '760961620', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Devin Stepan Norris');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Blaise Lanzetta', '550105585', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Blaise Lanzetta');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Gavi Grodsky', '639077912', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Gavi Grodsky');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Dennis Frank Pedula', '464375732', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Dennis Frank Pedula');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'John Conte', '1519265', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'John Conte');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Spencer J. Charif', '530921183', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Spencer J. Charif');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tjeerd Nijhof', '804373944', 'BMI BUMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tjeerd Nijhof');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Peter Russell Fox', '221883575', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Peter Russell Fox');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Gabrielle Coral Weinberger', '617492827', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Gabrielle Coral Weinberger');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Elaine Ryan', '529559904', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Elaine Ryan');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lindsay Fialka', '1185882315', 'SOCAN'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lindsay Fialka');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Adam Knobloch', '1176815335', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Adam Knobloch');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Christopher Chrisman', '826271145', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Christopher Chrisman');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Robert Mangano', '572689502', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Robert Mangano');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Malia Delacruz', '1186870025', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Malia Delacruz');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Antonio Nico Nieves', '834264341', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Antonio Nico Nieves');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lacey Angerosa', '118758107', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lacey Angerosa');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Katherine Rose Kaplan', '689822287', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Katherine Rose Kaplan');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Arizona Lindsey', '550619524', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Arizona Lindsey');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ariel Salerno', '1212866664', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ariel Salerno');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Lisette Gonzalez-Alea', '405475371', 'SACEM'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Lisette Gonzalez-Alea');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stacy Marie Werdin', '368252640', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stacy Marie Werdin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Riza Azeer Shahid', '1049410185', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Riza Azeer Shahid');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Jonathan Luis', '1147251376', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Jonathan Luis');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Oliver Nicholson', '1175517546', 'PRS'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Oliver Nicholson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Elyse J Jones', '1077531258', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Elyse J Jones');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Matt Thorne', '126052507', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Matt Thorne');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Thierry Christophe Meyer', '150936966', 'SACEM'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Thierry Christophe Meyer');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Dominic Kelly', '338412667', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Dominic Kelly');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Walter Woods', '513503397', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Walter Woods');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Willie Eaglin', '460689627', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Willie Eaglin');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Derek Randle', '11567741648', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Derek Randle');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Michael Ellery', '726160263', 'APRA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Michael Ellery');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Tony Exford', '516119181', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Tony Exford');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Ta-Ri Charles Wendell Wilson', '650559145', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Ta-Ri Charles Wendell Wilson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Gaelan Sebastian Aguado', '645719814', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Gaelan Sebastian Aguado');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Israel Charles', '217945845', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Israel Charles');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Luigi Bayaert', '1163198844', 'SACEM'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Luigi Bayaert');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Friday Famous Endurance', '1153071591', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Friday Famous Endurance');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Keith Joseph Anderson', '746479892', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Keith Joseph Anderson');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Alex Grinacoff', '1231726383', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Alex Grinacoff');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Sayuri Elsie', '626341462', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Sayuri Elsie');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stefano Mastronardi', '430488857', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stefano Mastronardi');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'James Karl Kernick', '348621257', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'James Karl Kernick');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'James Kyle Kernick', '348621257', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'James Kyle Kernick');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Brooke Maytorena', '1080732868', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Brooke Maytorena');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Simon Bhatia', '1220973865', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Simon Bhatia');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Maria Patricia Blyde', '1017914083', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Maria Patricia Blyde');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'EL Hachani Ali', '1029076-79', 'SACEM'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'EL Hachani Ali');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Karim Bachir Elezaar', '81457561', 'SACEM'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Karim Bachir Elezaar');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Romain Benabdelkader', '858126514', 'SACEM'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Romain Benabdelkader');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Garrett Lamp', '760707930', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Garrett Lamp');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stephan Schelens', '654670135', 'GEMA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stephan Schelens');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Koebi Faumui', '01335268354', 'APRA'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Koebi Faumui');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Paul Micca', '1128605176', 'ASCAP'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Paul Micca');
INSERT INTO cowriters (full_name, ipi_number, pro)
  SELECT 'Stewart Joseph Hidalgo', '680267631', 'BMI'
  WHERE NOT EXISTS (SELECT 1 FROM cowriters WHERE full_name = 'Stewart Joseph Hidalgo');