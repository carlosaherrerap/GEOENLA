-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tokens_acceso_personal" (
    "id" BIGSERIAL NOT NULL,
    "tokenable_type" TEXT NOT NULL,
    "tokenable_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "abilities" TEXT,
    "last_used_at" TIMESTAMP(0),
    "expires_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0),
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "tokens_acceso_personal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ubiedades" (
    "id" TEXT NOT NULL,
    "latitud" DECIMAL(10,7) NOT NULL,
    "longitud" DECIMAL(10,7) NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "ubiedades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horarios" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ingreso" TIME(0) NOT NULL,
    "salida" TIME(0) NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "horarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fec_inicio" DATE NOT NULL,
    "fec_fin" DATE NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "periodos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sedes" (
    "id" TEXT NOT NULL,
    "sede_reg" TEXT NOT NULL,
    "sede_juris" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "id_ubiety" TEXT NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividades" (
    "id" TEXT NOT NULL,
    "id_period" TEXT NOT NULL,
    "id_location" TEXT NOT NULL,
    "id_user" TEXT,
    "actividad" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "actividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisores" (
    "id" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "ape_pat" TEXT NOT NULL,
    "ape_mat" TEXT NOT NULL,
    "doc" TEXT NOT NULL,
    "nacionalidad" TEXT NOT NULL,
    "genero" TEXT NOT NULL,
    "telefono" VARCHAR(15) NOT NULL,
    "direccion" TEXT NOT NULL,
    "id_location" TEXT NOT NULL,
    "id_activity" TEXT NOT NULL,
    "id_ubiety" TEXT NOT NULL,
    "id_turno" TEXT NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "supervisores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "id_supervisor" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "clave" VARCHAR(60) NOT NULL,
    "correo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "rol" TEXT NOT NULL DEFAULT 'usuario',
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rutas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "id_user" TEXT NOT NULL,
    "id_sede" TEXT NOT NULL,
    "fec_visita" DATE NOT NULL,
    "id_period" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fec_asignado" DATE NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "rutas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencias" (
    "id" TEXT NOT NULL,
    "id_activity" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "evidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcaciones" (
    "id" TEXT NOT NULL,
    "id_ubiety" TEXT NOT NULL,
    "id_evidence" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fec_emitido" DATE NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "marcaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" TEXT NOT NULL,
    "id_user_1" TEXT NOT NULL,
    "id_user_2" TEXT NOT NULL,
    "last_update_chat" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes" (
    "id" TEXT NOT NULL,
    "id_chat" TEXT NOT NULL,
    "id_user_send_message" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "id_ubiety" TEXT,
    "fec_envio" TIMESTAMP(0) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'enviado',
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posiciones" (
    "id" TEXT NOT NULL,
    "id_user" TEXT NOT NULL,
    "id_activity" TEXT NOT NULL,
    "posx" DECIMAL(10,7) NOT NULL,
    "posy" DECIMAL(10,7) NOT NULL,
    "fec_reg" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "posiciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable (Partitioned by RANGE on recorded_at)
CREATE TABLE "seguimientos" (
    "id" BIGSERIAL NOT NULL,
    "id_user" TEXT NOT NULL,
    "id_activity" TEXT,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "accuracy" DECIMAL(6,2),
    "speed" DECIMAL(6,2),
    "battery_level" DECIMAL(5,2),
    "recorded_at" TIMESTAMP(0) NOT NULL,
    "is_synced" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "seguimientos_pkey" PRIMARY KEY ("id", "recorded_at")
) PARTITION BY RANGE ("recorded_at");

-- Partitions for seguimientos table
CREATE TABLE "seguimientos_default" PARTITION OF "seguimientos" DEFAULT;

CREATE TABLE "seguimientos_2026_07" PARTITION OF "seguimientos"
    FOR VALUES FROM ('2026-07-01 00:00:00') TO ('2026-08-01 00:00:00');

CREATE TABLE "seguimientos_2026_08" PARTITION OF "seguimientos"
    FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00');

CREATE TABLE "seguimientos_2026_09" PARTITION OF "seguimientos"
    FOR VALUES FROM ('2026-09-01 00:00:00') TO ('2026-10-01 00:00:00');


-- CreateTable
CREATE TABLE "asistencias" (
    "id" TEXT NOT NULL,
    "id_user" TEXT NOT NULL,
    "id_activity" TEXT NOT NULL,
    "id_location" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "distance_m" DECIMAL(8,2) NOT NULL,
    "photos" JSONB NOT NULL,
    "observacion" TEXT,
    "checked_in_at" TIMESTAMP(0) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'completado',
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_dispositivo" (
    "id" TEXT NOT NULL,
    "id_user" TEXT NOT NULL,
    "manufacturer" VARCHAR(100),
    "model" VARCHAR(100),
    "os" VARCHAR(50),
    "os_version" VARCHAR(50),
    "battery_level" DECIMAL(5,2),
    "battery_state" TEXT,
    "app_version" VARCHAR(50),
    "last_seen_at" TIMESTAMP(0),
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "detalles_dispositivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colas_sincronizacion" (
    "id" BIGSERIAL NOT NULL,
    "id_user" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT,
    "payload" JSONB NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(0),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "recorded_at" TIMESTAMP(0) NOT NULL,
    "created_at" TIMESTAMP(0) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0),

    CONSTRAINT "colas_sincronizacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_acceso_personal_token_key" ON "tokens_acceso_personal"("token");

-- CreateIndex
CREATE INDEX "tokens_acceso_personal_tokenable_type_tokenable_id_idx" ON "tokens_acceso_personal"("tokenable_type", "tokenable_id");

-- CreateIndex
CREATE UNIQUE INDEX "supervisores_doc_key" ON "supervisores"("doc");

-- CreateIndex
CREATE UNIQUE INDEX "supervisores_telefono_key" ON "supervisores"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE INDEX "seguimientos_id_user_recorded_at_idx" ON "seguimientos"("id_user", "recorded_at");

-- CreateIndex
CREATE INDEX "seguimientos_id_activity_recorded_at_idx" ON "seguimientos"("id_activity", "recorded_at");

-- CreateIndex
CREATE INDEX "seguimientos_recorded_at_idx" ON "seguimientos"("recorded_at");

-- CreateIndex
CREATE INDEX "asistencias_id_user_checked_in_at_idx" ON "asistencias"("id_user", "checked_in_at");

-- CreateIndex
CREATE INDEX "asistencias_id_activity_idx" ON "asistencias"("id_activity");

-- CreateIndex
CREATE UNIQUE INDEX "detalles_dispositivo_id_user_key" ON "detalles_dispositivo"("id_user");

-- CreateIndex
CREATE INDEX "colas_sincronizacion_id_user_status_idx" ON "colas_sincronizacion"("id_user", "status");

-- CreateIndex
CREATE INDEX "colas_sincronizacion_status_idx" ON "colas_sincronizacion"("status");

-- AddForeignKey
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_id_ubiety_fkey" FOREIGN KEY ("id_ubiety") REFERENCES "ubiedades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_id_period_fkey" FOREIGN KEY ("id_period") REFERENCES "periodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_id_location_fkey" FOREIGN KEY ("id_location") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisores" ADD CONSTRAINT "supervisores_id_location_fkey" FOREIGN KEY ("id_location") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisores" ADD CONSTRAINT "supervisores_id_activity_fkey" FOREIGN KEY ("id_activity") REFERENCES "actividades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisores" ADD CONSTRAINT "supervisores_id_ubiety_fkey" FOREIGN KEY ("id_ubiety") REFERENCES "ubiedades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisores" ADD CONSTRAINT "supervisores_id_turno_fkey" FOREIGN KEY ("id_turno") REFERENCES "horarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_supervisor_fkey" FOREIGN KEY ("id_supervisor") REFERENCES "supervisores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rutas" ADD CONSTRAINT "rutas_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rutas" ADD CONSTRAINT "rutas_id_sede_fkey" FOREIGN KEY ("id_sede") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rutas" ADD CONSTRAINT "rutas_id_period_fkey" FOREIGN KEY ("id_period") REFERENCES "periodos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_id_activity_fkey" FOREIGN KEY ("id_activity") REFERENCES "actividades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcaciones" ADD CONSTRAINT "marcaciones_id_ubiety_fkey" FOREIGN KEY ("id_ubiety") REFERENCES "ubiedades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcaciones" ADD CONSTRAINT "marcaciones_id_evidence_fkey" FOREIGN KEY ("id_evidence") REFERENCES "evidencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_id_user_1_fkey" FOREIGN KEY ("id_user_1") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_id_user_2_fkey" FOREIGN KEY ("id_user_2") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_id_chat_fkey" FOREIGN KEY ("id_chat") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_id_user_send_message_fkey" FOREIGN KEY ("id_user_send_message") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_id_ubiety_fkey" FOREIGN KEY ("id_ubiety") REFERENCES "ubiedades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posiciones" ADD CONSTRAINT "posiciones_id_activity_fkey" FOREIGN KEY ("id_activity") REFERENCES "actividades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_id_activity_fkey" FOREIGN KEY ("id_activity") REFERENCES "actividades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_id_activity_fkey" FOREIGN KEY ("id_activity") REFERENCES "actividades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencias" ADD CONSTRAINT "asistencias_id_location_fkey" FOREIGN KEY ("id_location") REFERENCES "sedes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_dispositivo" ADD CONSTRAINT "detalles_dispositivo_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colas_sincronizacion" ADD CONSTRAINT "colas_sincronizacion_id_user_fkey" FOREIGN KEY ("id_user") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
