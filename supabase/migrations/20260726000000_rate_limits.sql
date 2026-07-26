-- Durable rate limiting for public API routes.
--
-- The portfolio chat route previously counted requests in a per-process Map.
-- Every serverless instance kept its own counter, so the advertised "20 per
-- minute" cap was really "20 per minute per warm instance" - no protection at
-- all for the Gemma free tier. Counting in Postgres gives one shared window.

CREATE TABLE IF NOT EXISTS public.rate_limits (
    bucket TEXT NOT NULL,
    -- SHA-256 of the caller identity. Raw IP addresses are never stored.
    subject TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, subject, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No client role may read or write this table; it is reached only through the
-- SECURITY DEFINER function below, called with the service role key.
REVOKE ALL PRIVILEGES ON public.rate_limits FROM anon, authenticated;
GRANT ALL PRIVILEGES ON public.rate_limits TO service_role;

-- Increment and test in one statement so concurrent instances cannot both read
-- a stale count and both decide they are under the limit.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
    p_bucket TEXT,
    p_subject TEXT,
    p_limit INTEGER,
    p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_count INTEGER;
BEGIN
    IF p_limit < 1 OR p_window_seconds < 1 THEN
        RAISE EXCEPTION 'consume_rate_limit requires a positive limit and window';
    END IF;

    v_window_start := to_timestamp(
        floor(extract(EPOCH FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
    );

    -- At most one row survives per (bucket, subject): the current window.
    DELETE FROM public.rate_limits
    WHERE bucket = p_bucket
      AND subject = p_subject
      AND window_start < v_window_start;

    INSERT INTO public.rate_limits AS r (bucket, subject, window_start, request_count)
    VALUES (p_bucket, p_subject, v_window_start, 1)
    ON CONFLICT (bucket, subject, window_start)
    DO UPDATE SET request_count = r.request_count + 1
    RETURNING r.request_count INTO v_count;

    RETURN QUERY
    SELECT
        v_count <= p_limit,
        GREATEST(
            1,
            CEIL(
                EXTRACT(EPOCH FROM (v_window_start + make_interval(secs => p_window_seconds) - clock_timestamp()))
            )::INTEGER
        );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
