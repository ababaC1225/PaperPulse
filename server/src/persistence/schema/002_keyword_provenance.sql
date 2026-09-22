ALTER TABLE papers ADD COLUMN keyword_provenance_json TEXT NOT NULL DEFAULT '{"method":"provided"}' CHECK (json_valid(keyword_provenance_json));
