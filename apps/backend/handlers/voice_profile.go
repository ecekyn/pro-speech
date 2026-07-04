package handlers

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pro-speech/backend/services"
)

func GetVoiceProfile(c *gin.Context) {
	status, err := services.DefaultVoiceProfileStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, status)
}

func EnrollVoiceProfile(c *gin.Context) {
	file, header, err := c.Request.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No audio file provided"})
		return
	}
	defer file.Close()

	audioData, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filename := "voice-sample.m4a"
	if header != nil && header.Filename != "" {
		filename = header.Filename
	}

	status, err := services.EnrollDefaultVoiceProfile(audioData, filename)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, status)
}

func DeleteVoiceProfile(c *gin.Context) {
	if err := services.DeleteDefaultVoiceProfile(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}
