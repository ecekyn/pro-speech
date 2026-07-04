package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pro-speech/backend/handlers"
)

func main() {
	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})

	api := r.Group("/api")
	{
		api.POST("/analyze", handlers.AnalyzeAudio)
		api.GET("/voice-profile", handlers.GetVoiceProfile)
		api.POST("/voice-profile", handlers.EnrollVoiceProfile)
		api.DELETE("/voice-profile", handlers.DeleteVoiceProfile)
		api.POST("/sessions/audio", handlers.CreateAudioSession)
		api.POST("/sessions/text", handlers.CreateTextSession)
		api.GET("/sessions", handlers.GetSessions)
		api.GET("/reports/today", handlers.GetTodayReport)
		api.GET("/reports/:date", handlers.GetDailyReport)
	}

	r.Run(":8080")
}
