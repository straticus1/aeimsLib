<?php

class Database {
    private $pdo;
    
    public function __construct($host, $dbname, $user, $password, $port = 5432) {
        try {
            $dsn = "pgsql:host={$host};port={$port};dbname={$dbname}";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false
            ];

            $this->pdo = new PDO($dsn, $user, $password, $options);
        } catch (PDOException $e) {
            throw new Exception("Database connection failed: " . $e->getMessage());
        }
    }
    
    /**
     * Execute a query and return multiple rows
     */
    public function query($query, $params = []) {
        try {
            $stmt = $this->pdo->prepare($query);
            $stmt->execute($params);
            return $stmt->fetchAll();
        } catch (PDOException $e) {
            throw new Exception("Query failed: " . $e->getMessage());
        }
    }
    
    /**
     * Execute a query and return a single row
     */
    public function queryOne($query, $params = []) {
        try {
            $stmt = $this->pdo->prepare($query);
            $stmt->execute($params);
            return $stmt->fetch();
        } catch (PDOException $e) {
            throw new Exception("Query failed: " . $e->getMessage());
        }
    }
    
    /**
     * Insert a record and return the last insert ID
     */
    public function insert($table, $data) {
        try {
            $columns = array_keys($data);
            $values = array_values($data);
            $placeholders = str_repeat('?,', count($data) - 1) . '?';
            
            $query = "INSERT INTO {$table} (" . implode(',', $columns) . ") VALUES ({$placeholders})";
            $stmt = $this->pdo->prepare($query);
            $stmt->execute($values);
            
            return $this->pdo->lastInsertId();
        } catch (PDOException $e) {
            throw new Exception("Insert failed: " . $e->getMessage());
        }
    }
    
    /**
     * Update a record
     */
    public function update($table, $data, $where, $whereParams = []) {
        try {
            $set = [];
            $values = [];
            
            foreach ($data as $column => $value) {
                $set[] = "{$column} = ?";
                $values[] = $value;
            }
            
            $values = array_merge($values, $whereParams);
            $query = "UPDATE {$table} SET " . implode(',', $set) . " WHERE {$where}";
            
            $stmt = $this->pdo->prepare($query);
            return $stmt->execute($values);
        } catch (PDOException $e) {
            throw new Exception("Update failed: " . $e->getMessage());
        }
    }
    
    /**
     * Delete a record
     */
    public function delete($table, $where, $params = []) {
        try {
            $query = "DELETE FROM {$table} WHERE {$where}";
            $stmt = $this->pdo->prepare($query);
            return $stmt->execute($params);
        } catch (PDOException $e) {
            throw new Exception("Delete failed: " . $e->getMessage());
        }
    }
    
    /**
     * Begin a transaction
     */
    public function beginTransaction() {
        return $this->pdo->beginTransaction();
    }
    
    /**
     * Commit a transaction
     */
    public function commit() {
        return $this->pdo->commit();
    }
    
    /**
     * Rollback a transaction
     */
    public function rollBack() {
        return $this->pdo->rollBack();
    }
    
    /**
     * Get toys with their status
     */
    public function getToys($userId) {
        return $this->query("
            SELECT t.*,
                   CASE
                       WHEN t.last_connected IS NULL THEN 'disconnected'
                       WHEN EXTRACT(EPOCH FROM (NOW() - t.last_connected))/60 > 5 THEN 'disconnected'
                       ELSE 'connected'
                   END as status
            FROM toys t
            WHERE t.user_id = ?
            ORDER BY t.name ASC
        ", [$userId]);
    }
    
    /**
     * Get patterns with ratings
     */
    public function getPatterns($userId = null) {
        $query = "
            SELECT p.*,
                   COUNT(DISTINCT pr.id) as rating_count,
                   AVG(pr.rating) as average_rating,
                   p.user_id = ? as is_owner
            FROM patterns p
            LEFT JOIN pattern_ratings pr ON p.id = pr.pattern_id
            WHERE p.is_public = TRUE OR p.user_id = ?
            GROUP BY p.id
            ORDER BY p.created_at DESC
        ";
        
        return $this->query($query, [$userId, $userId]);
    }
    
    /**
     * Get user preferences
     */
    public function getUserPreferences($userId) {
        $preferences = $this->query("
            SELECT preference_key, preference_value
            FROM user_preferences
            WHERE user_id = ?
        ", [$userId]);
        
        $result = [];
        foreach ($preferences as $pref) {
            $result[$pref['preference_key']] = $pref['preference_value'];
        }
        
        return $result;
    }
    
    /**
     * Log activity
     */
    public function logActivity($userId, $activityType, $toyId = null, $details = null) {
        $data = [
            'user_id' => $userId,
            'toy_id' => $toyId,
            'activity_type' => $activityType,
            'details' => $details ? json_encode($details) : null
        ];
        
        return $this->insert('activity_log', $data);
    }
}
