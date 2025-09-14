const { poolPromise } = require('../config/db');
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Función auxiliar para insertar funciones específicas por tipo de usuario
const insertEmpresa = async (transaction, userId, data) => {
    const { nombre_empresa, NIT, direccion, telefono, sitio_web, descripcion } = data;
    
    await transaction.request()
        .input('id_usuario', userId)
        .input('nombre_empresa', nombre_empresa)
        .input('NIT', NIT)
        .input('direccion', direccion || null)
        .input('telefono', telefono || null)
        .input('sitio_web', sitio_web || null)
        .input('descripcion', descripcion || null)
        .query(`
            INSERT INTO empresas 
            (id_usuario, nombre_empresa, NIT, direccion, telefono, sitio_web, descripcion)
            VALUES (@id_usuario, @nombre_empresa, @NIT, @direccion, @telefono, @sitio_web, @descripcion)
        `);
};

const insertONG = async (transaction, userId, data) => {
    const { nombre_ong, NIT, direccion, telefono, sitio_web, descripcion } = data;
    
    await transaction.request()
        .input('id_usuario', userId)
        .input('nombre_ong', nombre_ong)
        .input('NIT', NIT)
        .input('direccion', direccion || null)
        .input('telefono', telefono || null)
        .input('sitio_web', sitio_web || null)
        .input('descripcion', descripcion || null)
        .query(`
            INSERT INTO ONGS 
            (id_usuario, nombre_ong, NIT, direccion, telefono, sitio_web, descripcion)
            VALUES (@id_usuario, @nombre_ong, @NIT, @direccion, @telefono, @sitio_web, @descripcion)
        `);
};

const insertIntegrante = async (transaction, userId, data, correo) => {
    const { nombres, apellidos, fecha_nacimiento, telefono, descripcion } = data;
    
    await transaction.request()
        .input('id_usuario', userId)
        .input('nombres', nombres)
        .input('apellidos', apellidos)
        .input('fecha_nacimiento', fecha_nacimiento || null)
        .input('Email', correo || null)  // Ahora recibe correo como parámetro
        .input('PhoneNumber', telefono || null)  // Cambiado de PhoneNumber a telefono
        .input('descripcion', descripcion || null)
        .input('activo', 1) 
        .query(`
            INSERT INTO integrantes_externos 
            (id_usuario, nombres, apellidos, fecha_nacimiento, Email, PhoneNumber, descripcion, activo)
            VALUES (@id_usuario, @nombres, @apellidos, @fecha_nacimiento, @Email, @PhoneNumber, @descripcion, @activo)
        `);
};

const insertSuperAdmin = async (transaction, userId, data) => {
    const { nivel_acceso } = data;
    
    await transaction.request()
        .input('id_usuario', userId)
        .input('nivel_acceso', nivel_acceso || 'super_admin')
        .query(`
            INSERT INTO super_admins 
            (id_usuario, nivel_acceso)
            VALUES (@id_usuario, @nivel_acceso)
        `);
};

// Función para generar 
const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const registerUser = async (req, res) => {
    const { tipo_usuario, nombre_usuario, correo, contrasena, ...rest } = req.body;

    // Validación básica
    if (!tipo_usuario || !nombre_usuario || !correo || !contrasena) {
        return res.status(400).json({ 
            success: false,
            error: "Faltan campos requeridos: tipo_usuario, nombre_usuario, correo, contrasena" 
        });
    }

    // Declarar variables en el scope principal
    let newUserId = null;
    let mongoUser = null;

    try {
        // Verificar si el usuario ya existe en MongoDB
        const existingMongoUser = await User.findOne({
            $or: [{ correo }, { nombre_usuario }]
        });

        if (existingMongoUser) {
            return res.status(400).json({
                success: false,
                error: "El usuario ya existe en el sistema"
            });
        }

        console.log('🔐 Hasheando contraseña para SQL Server...');
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(contrasena, saltRounds);
        console.log('✅ Contraseña hasheada exitosamente');

        const pool = await poolPromise;
        const transaction = pool.transaction();
        
        await transaction.begin();
        try {
            // Insertar en SQL Server
            const usuarioResult = await transaction.request()
                .input('nombre_usuario', nombre_usuario)
                .input('correo', correo)
                .input('contrasena', hashedPassword)
                .input('tipo_usuario', tipo_usuario)
                .query(`
                    INSERT INTO usuarios 
                    (nombre_usuario, correo_electronico, contrasena, tipo_usuario)
                    OUTPUT INSERTED.id_usuario
                    VALUES (@nombre_usuario, @correo, @contrasena, @tipo_usuario)
                `);

            newUserId = usuarioResult.recordset[0].id_usuario;

            // Insertar en tabla específica según tipo de usuario en SQL Server
            switch(tipo_usuario) {
                case 'Empresa':
                    await insertEmpresa(transaction, newUserId, rest);
                    break;
                case 'ONG':
                    console.log('REST recibido para ONG:', rest);
                    await insertONG(transaction, newUserId, rest);
                    break;
                case 'Integrante externo':
                    console.log('Datos para integrante externo:', rest);
                    await insertIntegrante(transaction, newUserId, rest, correo); // Pasar correo como parámetro adicional
                    break;
                case 'Super admin':
                    await insertSuperAdmin(transaction, newUserId, rest);
                    break;
                default:
                    throw new Error('Tipo de usuario no válido');
            }

            // Crear usuario en MongoDB
            mongoUser = new User({
                sqlUserId: newUserId,
                nombre_usuario,
                correo,
                contrasena, // Se hasheará automáticamente por el middleware
                tipo_usuario
            });

            await mongoUser.save();
            await transaction.commit();
            
            // Generar token JWT
            const token = generateToken(mongoUser._id);

            res.status(201).json({
                success: true,
                message: "Usuario registrado exitosamente",
                user: mongoUser.toSafeObject(),
                token
            });

        } catch (error) {

            console.error('❌ Error original en registro:', error);
            if (error.precedingErrors && Array.isArray(error.precedingErrors)) {
                console.error('❌ Detalle SQL:', error.precedingErrors);
            }

            await transaction.rollback();
            
            // Si hay error, también eliminar de MongoDB si se creó
            if (mongoUser && mongoUser._id) {
                await User.findByIdAndDelete(mongoUser._id).catch(() => {});
            }
            
            throw error;
        }

    } catch (error) {
        console.error('Error en registro:', error);

        // Cleanup adicional en caso de error
        if (newUserId && mongoUser && mongoUser._id) {
            await User.findByIdAndDelete(mongoUser._id).catch(() => {});
        }

        // Manejar errores de SQL Server
        if (error.number === 2627) {
            const field = error.message.includes('nombre_usuario') ? 'nombre de usuario' : 
                         error.message.includes('correo_electronico') ? 'correo electrónico' :
                         error.message.includes('NIT') ? 'NIT' : 'campo único';
            
            return res.status(400).json({
                success: false,
                error: `El ${field} ya está registrado`
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || "Error en el servidor"
        });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ 
            success: false,
            error: "Email y contraseña son requeridos." 
        });
    }

    try {
        // Buscar usuario en MongoDB
        const mongoUser = await User.findOne({ correo: email, activo: true });
        
        if (!mongoUser) {
            return res.status(404).json({ 
                success: false,
                error: "Usuario no encontrado." 
            });
        }

        // Verificar contraseña
        const isPasswordValid = await mongoUser.comparePassword(password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false,
                error: "Contraseña incorrecta." 
            });
        }

        // Verificar que el usuario también exista en SQL Server
        const pool = await poolPromise;
        const sqlResult = await pool.request()
            .input('id_usuario', mongoUser.sqlUserId)
            .query('SELECT * FROM usuarios WHERE id_usuario = @id_usuario AND activo = 1');

        if (sqlResult.recordset.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: "Usuario no encontrado en el sistema principal." 
            });
        }

        // Actualizar último acceso
        mongoUser.ultimoAcceso = new Date();
        
        // Generar token y registrar sesión
        const token = generateToken(mongoUser._id);
        
        mongoUser.sesiones.push({
            token: token.substring(0, 20) + '...', // Solo guardamos parte del token por seguridad
            dispositivo: req.headers['user-agent'] || 'Unknown',
            ip: req.ip || req.connection.remoteAddress
        });

        await mongoUser.save();

        res.json({ 
            success: true,
            message: "Login exitoso",
            user: mongoUser.toSafeObject(),
            token
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            success: false,
            error: "Error interno del servidor." 
        });
    }
};

const logout = async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (token && req.user) {
            // Marcar sesión como inactiva en MongoDB
            await User.findByIdAndUpdate(req.user.userId, {
                $set: { 'sesiones.$[elem].activa': false }
            }, {
                arrayFilters: [{ 'elem.token': { $regex: token.substring(0, 20) } }]
            });
        }

        res.status(200).json({ 
            success: true,
            message: 'Sesión cerrada exitosamente.' 
        });
    } catch (error) {
        console.error('Error en logout:', error);
        res.status(500).json({ 
            success: false,
            error: "Error al cerrar sesión." 
        });
    }
};

// Función para obtener perfil del usuario
const getProfile = async (req, res) => {
    try {
        const mongoUser = await User.findById(req.user.userId);
        
        if (!mongoUser) {
            return res.status(404).json({
                success: false,
                error: "Usuario no encontrado"
            });
        }

        // Obtener datos adicionales de SQL Server
        const pool = await poolPromise;
        const sqlResult = await pool.request()
            .input('id_usuario', mongoUser.sqlUserId)
            .query('SELECT * FROM usuarios WHERE id_usuario = @id_usuario');

        const sqlUser = sqlResult.recordset[0];

        res.json({
            success: true,
            user: {
                ...mongoUser.toSafeObject(),
                sqlData: {
                    ...sqlUser,
                    contrasena: undefined // No enviar contraseña
                }
            }
        });
    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};



const forgotPasswordSimple = async (req, res) => {
    const { email, nombre_usuario } = req.body;

    // Validación básica
    if (!email || !nombre_usuario) {
        return res.status(400).json({
            success: false,
            error: "Email y nombre de usuario son requeridos"
        });
    }

    try {
        console.log('🔍 Buscando usuario para recuperación de contraseña...');
        
        // Buscar usuario en MongoDB por email Y nombre de usuario
        const mongoUser = await User.findOne({ 
            correo: email.toLowerCase().trim(),
            nombre_usuario: nombre_usuario.trim(),
            activo: true 
        });

        if (!mongoUser) {
            return res.status(404).json({
                success: false,
                error: "No se encontró un usuario con ese email y nombre de usuario"
            });
        }

        // Verificar también en SQL Server
        const pool = await poolPromise;
        const sqlResult = await pool.request()
            .input('id_usuario', mongoUser.sqlUserId)
            .input('email', email.toLowerCase().trim())
            .input('nombre_usuario', nombre_usuario.trim())
            .query(`
                SELECT id_usuario, nombre_usuario, correo_electronico 
                FROM usuarios 
                WHERE id_usuario = @id_usuario 
                AND correo_electronico = @email 
                AND nombre_usuario = @nombre_usuario
                AND activo = 1
            `);

        if (sqlResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Los datos no coinciden con nuestros registros"
            });
        }

        console.log('✅ Usuario verificado correctamente');

        // Respuesta exitosa (sin revelar mucha información)
        res.json({
            success: true,
            message: "Usuario verificado. Ahora puedes cambiar tu contraseña.",
            userId: mongoUser._id, // Necesario para el siguiente paso
            email: email,
            nombre_usuario: nombre_usuario
        });

    } catch (error) {
        console.error('Error en recuperación de contraseña:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// 🔐 FUNCIÓN SIMPLE: Cambiar contraseña
const resetPasswordSimple = async (req, res) => {
    const { userId, email, nombre_usuario, nuevaContrasena, confirmarContrasena } = req.body;

    // Validación básica
    if (!userId || !email || !nombre_usuario || !nuevaContrasena || !confirmarContrasena) {
        return res.status(400).json({
            success: false,
            error: "Todos los campos son requeridos"
        });
    }

    // Verificar que las contraseñas coincidan
    if (nuevaContrasena !== confirmarContrasena) {
        return res.status(400).json({
            success: false,
            error: "Las contraseñas no coinciden"
        });
    }

    // Validar longitud de contraseña
    if (nuevaContrasena.length < 6) {
        return res.status(400).json({
            success: false,
            error: "La contraseña debe tener al menos 6 caracteres"
        });
    }

    try {
        console.log('🔄 Iniciando cambio de contraseña...');

        // Verificar que el usuario existe y coincide
        const mongoUser = await User.findOne({ 
            _id: userId,
            correo: email.toLowerCase().trim(),
            nombre_usuario: nombre_usuario.trim(),
            activo: true 
        });

        if (!mongoUser) {
            return res.status(404).json({
                success: false,
                error: "Usuario no encontrado o datos incorrectos"
            });
        }

        // Hashear la nueva contraseña para SQL Server
        console.log('🔐 Hasheando nueva contraseña...');
        const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);

        // Actualizar en SQL Server primero
        const pool = await poolPromise;
        const transaction = pool.transaction();
        
        await transaction.begin();

        try {
            console.log('💾 Actualizando contraseña en SQL Server...');
            await transaction.request()
                .input('id_usuario', mongoUser.sqlUserId)
                .input('nueva_contrasena', hashedPassword)
                .query(`
                    UPDATE usuarios 
                    SET contrasena = @nueva_contrasena,
                        fecha_actualizacion = GETDATE()
                    WHERE id_usuario = @id_usuario
                `);

            // Actualizar en MongoDB (el middleware la hasheará automáticamente)
            console.log('💾 Actualizando contraseña en MongoDB...');
            mongoUser.contrasena = nuevaContrasena; // Será hasheada por el middleware
            
            // Limpiar sesiones existentes (opcional)
            mongoUser.sesiones = mongoUser.sesiones.map(sesion => ({
                ...sesion,
                activa: false
            }));

            await mongoUser.save();
            await transaction.commit();

            console.log('✅ Contraseña actualizada exitosamente en ambas bases de datos');

            res.json({
                success: true,
                message: "Contraseña cambiada exitosamente. Por favor, inicia sesión con tu nueva contraseña."
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Error cambiando contraseña:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// 🔍 FUNCIÓN ADICIONAL: Verificar si email existe
const checkEmailExists = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            error: "Email es requerido"
        });
    }

    try {
        const mongoUser = await User.findOne({ 
            correo: email.toLowerCase().trim(),
            activo: true 
        });

        res.json({
            success: true,
            exists: !!mongoUser,
            message: mongoUser 
                ? "Email encontrado en el sistema" 
                : "Email no encontrado"
        });

    } catch (error) {
        console.error('Error verificando email:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

// 👤 FUNCIÓN ADICIONAL: Obtener pista de usuario por email
const getUserHint = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            error: "Email es requerido"
        });
    }

    try {
        const mongoUser = await User.findOne({ 
            correo: email.toLowerCase().trim(),
            activo: true 
        });

        if (!mongoUser) {
            return res.status(404).json({
                success: false,
                error: "Email no encontrado"
            });
        }

        // Dar pista del nombre de usuario (mostrar solo primeros y últimos caracteres)
        const username = mongoUser.nombre_usuario;
        let hint = '';
        
        if (username.length <= 3) {
            hint = username.charAt(0) + '*'.repeat(username.length - 1);
        } else {
            const start = username.substring(0, 2);
            const end = username.substring(username.length - 2);
            const middle = '*'.repeat(username.length - 4);
            hint = start + middle + end;
        }

        res.json({
            success: true,
            hint: `Tu nombre de usuario es: ${hint}`,
            tipo_usuario: mongoUser.tipo_usuario
        });

    } catch (error) {
        console.error('Error obteniendo pista:', error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
};

module.exports = { 
    registerUser, 
    login, 
    logout, 
    getProfile,
    forgotPasswordSimple,    
    resetPasswordSimple,      
    checkEmailExists,        
    getUserHint  
};