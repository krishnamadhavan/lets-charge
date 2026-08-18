-- Lab demo: one society, three slots, EVerest cp001, two residents, one admin.
-- Admin login is `admin` / `admin` (scrypt hash below). Not for a public host.

INSERT INTO societies (
  id, name, timezone, site_amp_cap_amps, billing_mode, test_tariff_paise_per_kwh
) VALUES (
  '01900000-0000-7000-8000-000000000001',
  'Demo Society',
  'Asia/Kolkata',
  200,
  'prepaid_wallet',
  1000
) ON CONFLICT (id) DO NOTHING;

INSERT INTO parking_slots (id, society_id, label, kind) VALUES
  ('01900000-0000-7000-8000-000000000011', '01900000-0000-7000-8000-000000000001', 'B-12', 'assigned'),
  ('01900000-0000-7000-8000-000000000012', '01900000-0000-7000-8000-000000000001', 'B-14', 'assigned'),
  ('01900000-0000-7000-8000-000000000013', '01900000-0000-7000-8000-000000000001', 'Podium-04', 'shared')
ON CONFLICT (id) DO NOTHING;

INSERT INTO chargers (
  id, society_id, slot_id, vendor, model, serial, firmware,
  ocpp_station_id, hardware_profile_id, short_code, certified
) VALUES (
  '01900000-0000-7000-8000-000000000021',
  '01900000-0000-7000-8000-000000000001',
  '01900000-0000-7000-8000-000000000011',
  'Pionix',
  'Yeti',
  'cp001',
  '0.1',
  'cp001',
  NULL,
  'LC-B12',
  false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO connectors (id, charger_id, ocpp_connector_id, ocpp_evse_id, label) VALUES (
  '01900000-0000-7000-8000-000000000031',
  '01900000-0000-7000-8000-000000000021',
  1,
  NULL,
  '1'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO residents (
  id, society_id, flat_label, display_name, phone, ocpp_id_tag, status
) VALUES
  (
    '01900000-0000-7000-8000-000000000041',
    '01900000-0000-7000-8000-000000000001',
    'A-1203',
    'Priya Sharma',
    '+919800000001',
    'LCDEMO00001',
    'active'
  ),
  (
    '01900000-0000-7000-8000-000000000042',
    '01900000-0000-7000-8000-000000000001',
    'A-1204',
    'Rahul Iyer',
    '+919800000002',
    'LCDEMO00002',
    'active'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallets (id, resident_id, balance_paise) VALUES
  ('01900000-0000-7000-8000-000000000051', '01900000-0000-7000-8000-000000000041', 100000),
  ('01900000-0000-7000-8000-000000000052', '01900000-0000-7000-8000-000000000042', 100000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO wallet_entries (wallet_id, amount_paise, reason)
SELECT id, 100000, 'topup_stub'
FROM wallets
WHERE id IN (
  '01900000-0000-7000-8000-000000000051',
  '01900000-0000-7000-8000-000000000052'
)
AND NOT EXISTS (
  SELECT 1 FROM wallet_entries e WHERE e.wallet_id = wallets.id AND e.reason = 'topup_stub'
);

INSERT INTO admin_users (id, login, password_hash) VALUES (
  '01900000-0000-7000-8000-000000000061',
  'admin',
  'scrypt:16384:8:1:bGV0c2NoYXJnZS1sYWItYWRtaW4tdjE:d1wgShAfEs9QWqPiwzg0_MEpXYo4tsqJBexpbQNf8OU'
) ON CONFLICT (id) DO NOTHING;
