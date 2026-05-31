-- Migracja inicjalna bazy danych sklepu
CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255)    NOT NULL,
    price       DECIMAL(10, 2)  NOT NULL CHECK (price >= 0),
    description TEXT            DEFAULT '',
    in_stock    BOOLEAN         DEFAULT TRUE,
    created_at  TIMESTAMP       DEFAULT NOW()
);

-- Dane przykładowe (ignoruj duplikaty przy ponownym uruchomieniu)
INSERT INTO products (name, price, description, in_stock) VALUES
    ('Kawa Arabica 250g',      29.99, 'Kawa ziarnista z Etiopii, intensywny aromat',   TRUE),
    ('Herbata Earl Grey 100g', 15.50, 'Czarna herbata z bergamotką, puszka metalowa',  TRUE),
    ('Czekolada Gorzka 70%',    8.99, 'Belgijska czekolada gorzka, tabliczka 100g',    TRUE),
    ('Mleko Owsiane 1L',        6.49, 'Roślinny napój owsiany, bez laktozy',           TRUE),
    ('Syrop Klonowy 250ml',    24.90, 'Naturalny syrop klonowy Grade A z Kanady',      FALSE)
ON CONFLICT DO NOTHING;
