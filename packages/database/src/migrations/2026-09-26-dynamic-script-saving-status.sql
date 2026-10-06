ALTER TABLE dynamic_script_generations
    DROP CONSTRAINT dynamic_script_generations_status_check;

ALTER TABLE dynamic_script_generations
    ADD CONSTRAINT dynamic_script_generations_status_check
    CHECK (status IN ('pending', 'generating', 'validating', 'revising', 'saving', 'ready', 'failed'));
