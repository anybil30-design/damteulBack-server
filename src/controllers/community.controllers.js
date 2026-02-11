const connection = require("../db");

// ✅ 1. 게시글 작성 (commCreate)
exports.commCreate = (req, res) => {
    // 프론트엔드에서 보낸 JSON 데이터를 그대로 받습니다.
    const { user_id, title, content, cate, image_urls, tags } = req.body;
    
    let parsedTags = [];
    try {
        parsedTags = tags ? JSON.parse(tags) : [];
    } catch (e) {
        console.error("❌ 태그 JSON 파싱 실패:", e);
    }

    // ⚠️ 중요: user_id || 1 을 삭제하여 프론트에서 보낸 실제 ID가 저장되게 합니다.
    const sqlPost = "INSERT INTO dam_community_posts (user_id, title, content, cate) VALUES (?, ?, ?, ?)";
    
    connection.query(sqlPost, [user_id, title, content, cate], (err, result) => {
        if (err) {
            console.error("❌ 게시글 저장 SQL 에러:", err.sqlMessage);
            return res.status(500).json({ success: false, message: "게시글 저장 실패" });
        }

        const post_id = result.insertId;

        // 이미 업로드된 이미지 파일명 배열(image_urls)이 있을 경우 실행
        if (image_urls && image_urls.length > 0) {
            image_urls.forEach((filename, index) => {
                const sqlImg = "INSERT INTO dam_community_images (post_id, image_url) VALUES (?, ?)";
                
                connection.query(sqlImg, [post_id, filename], (imgErr, imgResult) => {
                    if (imgErr) {
                        console.error("❌ 이미지 저장 실패:", imgErr.sqlMessage);
                        return;
                    }

                    const image_id = imgResult.insertId;
                    const currentFileTags = parsedTags[index]; 

                    // 해당 이미지 인덱스에 매칭되는 태그 정보 저장
                    if (Array.isArray(currentFileTags) && currentFileTags.length > 0) {
                        currentFileTags.forEach(tag => {
                            const sqlTag = "INSERT INTO dam_community_tags (image_id, goods_id, x_pos, y_pos) VALUES (?, ?, ?, ?)";
                            const tagParams = [image_id, tag.goods_id || null, tag.x || 0, tag.y || 0];

                            connection.query(sqlTag, tagParams, (tagErr) => {
                                if (tagErr) console.error("❌ 태그 저장 실패:", tagErr.sqlMessage);
                            });
                        });
                    }
                });
            });
        }
        return res.status(201).json({ success: true, post_id });
    });
};

// ✅ 2. 게시글 목록 조회 (commList)
exports.commList = (req, res) => {
    const sql = `
        SELECT p.post_id AS id, p.title, p.cate, p.created_at,
            (SELECT image_url FROM dam_community_images WHERE post_id = p.post_id LIMIT 1) AS image_url,
            (SELECT COUNT(*) FROM dam_community_likes WHERE post_id = p.post_id) AS heart
        FROM dam_community_posts p
        -- ✅ 이미지가 등록된 게시글만 조회하도록 조건 추가
        WHERE p.is_deleted = 0 
            AND EXISTS (SELECT 1 FROM dam_community_images WHERE post_id = p.post_id)
        ORDER BY p.created_at DESC
    `;
    connection.query(sql, (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json(results);
    });
};

// ✅ 3. 게시글 상세 조회 수정 (태그 정보 포함)
exports.commDetail = (req, res) => {
    const { id } = req.params;

    // 1) 게시글 정보 조회
    const sqlPost = `
        SELECT p.*, u.user_nickname, u.level_code, u.profile,
            (SELECT COUNT(*) FROM dam_community_likes WHERE post_id = p.post_id) AS initial_like_count
        FROM dam_community_posts p
        LEFT JOIN damteul_users u ON p.user_id = u.user_id
        WHERE p.post_id = ? AND p.is_deleted = 0
    `;

    connection.query(sqlPost, [id], (err, postResult) => {
        if (err) return res.status(500).json({ error: "DB 에러" });
        if (!postResult || postResult.length === 0) return res.status(404).json({ message: "글 없음" });

        // 2) 이미지 정보 조회
        const sqlImages = `SELECT image_id, image_url FROM dam_community_images WHERE post_id = ?`;

        connection.query(sqlImages, [id], (err, imageRows) => {
            if (err) return res.status(500).json({ error: "이미지 조회 실패" });

            const safeImages = imageRows || [];
            if (safeImages.length === 0) {
                // 이미지가 없는 경우
                return res.json({ post: postResult[0], images: [] });
            }

            // 3) 태그 정보 조회 (JOIN 사용)
            const sqlTags = `
                SELECT t.*, g.title as name, g.price 
                FROM dam_community_tags t
                LEFT JOIN dam_goods_posts g ON t.goods_id = g.goods_id
                WHERE t.image_id IN (SELECT image_id FROM dam_community_images WHERE post_id = ?)
            `;

            connection.query(sqlTags, [id], (err, tagRows) => {
                if (err) return res.status(500).json({ error: "태그 조회 실패" });

                // 4) 최종 데이터 구조 조립 (프론트엔드와 일치시킴)
                const finalImages = safeImages.map(img => ({
                    ...img,
                    tags: (tagRows || []).filter(tag => tag.image_id === img.image_id)
                }));

                // ✅ { post, images } 구조로 응답
                res.json({
                    post: postResult[0],
                    images: finalImages
                });
            });
        });
    });
};

// ✅ 5-1. 게시글 수정 (Update)
exports.commUpdate = (req, res) => {
    const { id } = req.params;
    const { title, content, cate } = req.body;
    
    const sql = "UPDATE dam_community_posts SET title = ?, content = ?, cate = ? WHERE post_id = ? AND is_deleted = 0";
    
    connection.query(sql, [title, content, cate, id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
};
// ✅ 5-2. 게시글 삭제 (Soft Delete)
exports.commDelete = (req, res) => {
    const { id } = req.params;
    const sql = "UPDATE dam_community_posts SET is_deleted = 1 WHERE post_id = ?"; 
    connection.query(sql, [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "삭제 실패" });
        res.json({ success: true, message: "삭제되었습니다." });
    });
};

// ✅ 6. 좋아요 데이터 조회 (404 에러 방지용)
exports.getLikeStatus = (req, res) => {
    const { id } = req.params;
    const { user_id } = req.query;

    const sqlCount = "SELECT COUNT(*) AS count FROM dam_community_likes WHERE post_id = ?";
    const sqlCheck = "SELECT COUNT(*) AS isLiked FROM dam_community_likes WHERE post_id = ? AND user_id = ?";

    connection.query(sqlCount, [id], (err, countRes) => {
        connection.query(sqlCheck, [id, user_id], (err2, checkRes) => {
            if (err || err2) return res.status(500).json({ success: false });
            res.json({
                likeCount: countRes[0]?.count || 0,
                isLiked: (checkRes[0]?.isLiked || 0) > 0
            });
        });
    });
};

// ✅ 좋아요 상태 및 개수 조회 (콜백 방식)
exports.getLikeStatus = (req, res) => {
    const { id } = req.params;
    const { user_id } = req.query;

    const sqlCount = "SELECT COUNT(*) AS count FROM dam_community_likes WHERE post_id = ?";
    const sqlCheck = "SELECT COUNT(*) AS isLiked FROM dam_community_likes WHERE post_id = ? AND user_id = ?";

    connection.query(sqlCount, [id], (err, countRes) => {
        if (err) return res.status(500).json({ success: false });
        
        connection.query(sqlCheck, [id, user_id], (err2, checkRes) => {
            if (err2) return res.status(500).json({ success: false });
            
            res.json({
                likeCount: countRes[0].count,
                isLiked: checkRes[0].isLiked > 0
            });
        });
    });
};

// ✅ 좋아요 토글 로직 (콜백 방식)
exports.toggleLike = (req, res) => {
    const { post_id, user_id } = req.body;
    
    // 1. 이미 좋아요를 눌렀는지 확인
    const sqlCheck = "SELECT * FROM dam_community_likes WHERE post_id = ? AND user_id = ?";
    
    connection.query(sqlCheck, [post_id, user_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false });

        if (rows.length > 0) {
            // 2. 이미 있다면 삭제 (좋아요 취소)
            const sqlDelete = "DELETE FROM dam_community_likes WHERE post_id = ? AND user_id = ?";
            connection.query(sqlDelete, [post_id, user_id], (err3) => {
                if (err3) return res.status(500).json({ success: false });
                res.json({ success: true, action: 'unliked' });
            });
        } else {
            // 3. 없다면 추가 (좋아요)
            const sqlInsert = "INSERT INTO dam_community_likes (post_id, user_id) VALUES (?, ?)";
            connection.query(sqlInsert, [post_id, user_id], (err2) => {
                if (err2) return res.status(500).json({ success: false });
                res.json({ success: true, action: 'liked' });
            });
        }
    });
};






// ✅ 댓글 목록 조회
exports.getComments = (req, res) => {
    const { id } = req.params; // post_id
    const sql = `
        SELECT c.*, u.user_nickname, u.profile 
        FROM dam_community_comments c
        JOIN damteul_users u ON c.user_id = u.user_id
        WHERE c.post_id = ? AND c.is_deleted = 0
        ORDER BY c.created_at ASC
    `;
    connection.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json(results);
    });
};

// ✅ 댓글 작성
exports.addComment = (req, res) => {
    const { post_id, user_id, content } = req.body;
    const sql = "INSERT INTO dam_community_comments (post_id, user_id, content) VALUES (?, ?, ?)";
    connection.query(sql, [post_id, user_id, content], (err, result) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, comment_id: result.insertId });
    });
};