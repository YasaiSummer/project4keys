const moment = require('moment');

class FourKeysMetricsService {
  constructor(backlogApiService, project) {
    this.backlogApi = backlogApiService;
    this.project = project;
  }

  async calculateAllMetrics(config) {
    const {
      completionStatusIds = [],
      changeTypeIds = [],
      changeCategoryIds = [],
      bugTypeIds = [],
      bugCategoryIds = [],
      since,
      until
    } = config;

    const [
      deploymentFrequency,
      leadTime,
      mttr,
      changeFailureRate
    ] = await Promise.all([
      this.calculateDeploymentFrequency(completionStatusIds, since, until),
      this.calculateLeadTime(changeTypeIds, changeCategoryIds, completionStatusIds, since, until),
      this.calculateMTTR(bugTypeIds, bugCategoryIds, since, until),
      this.calculateChangeFailureRate(changeTypeIds, changeCategoryIds, bugTypeIds, bugCategoryIds, since, until)
    ]);

    return {
      deploymentFrequency,
      leadTime,
      meanTimeToRecovery: mttr,
      changeFailureRate,
      calculatedAt: new Date().toISOString(),
      period: { since, until },
      project: {
        id: this.project.id,
        key: this.project.projectKey,
        name: this.project.name
      }
    };
  }

  async calculateDeploymentFrequency(completionStatusIds, since, until) {
    try {
      if (!completionStatusIds || completionStatusIds.length === 0) {
        return {
          value: 0,
          unit: 'deployments per day',
          performanceLevel: 'low',
          description: 'No completion statuses configured'
        };
      }

      const issues = await this.backlogApi.getAllIssues(this.project.id, {
        statusId: completionStatusIds,
        updatedSince: since,
        updatedUntil: until
      });

      const deploymentCount = issues.length;
      const periodDays = this.calculatePeriodInDays(since, until);
      const deploymentsPerDay = periodDays > 0 ? deploymentCount / periodDays : 0;

      return {
        value: deploymentsPerDay,
        count: deploymentCount,
        periodDays,
        unit: 'deployments per day',
        performanceLevel: this.getDeploymentFrequencyLevel(deploymentsPerDay),
        description: `${deploymentCount} deployments in ${periodDays} days`
      };
    } catch (error) {
      throw new Error(`Failed to calculate deployment frequency: ${error.message}`);
    }
  }

  async calculateLeadTime(changeTypeIds, changeCategoryIds, completionStatusIds, since, until) {
    try {
      if ((!changeTypeIds || changeTypeIds.length === 0) && 
          (!changeCategoryIds || changeCategoryIds.length === 0)) {
        return {
          value: 0,
          unit: 'days',
          performanceLevel: 'low',
          description: 'No change types or categories configured'
        };
      }

      const filters = {
        updatedSince: since,
        updatedUntil: until
      };

      if (changeTypeIds && changeTypeIds.length > 0) {
        filters.issueTypeId = changeTypeIds;
      }
      
      if (changeCategoryIds && changeCategoryIds.length > 0) {
        filters.categoryId = changeCategoryIds;
      }

      if (completionStatusIds && completionStatusIds.length > 0) {
        filters.statusId = completionStatusIds;
      }

      const issues = await this.backlogApi.getAllIssues(this.project.id, filters);

      if (issues.length === 0) {
        return {
          value: 0,
          unit: 'days',
          performanceLevel: 'low',
          description: 'No completed change issues found'
        };
      }

      const leadTimes = issues
        .filter(issue => issue.created && issue.updated)
        .map(issue => {
          const created = moment(issue.created);
          const completed = moment(issue.updated);
          return completed.diff(created, 'days', true);
        })
        .filter(days => days >= 0);

      if (leadTimes.length === 0) {
        return {
          value: 0,
          unit: 'days',
          performanceLevel: 'low',
          description: 'No valid lead times calculated'
        };
      }

      const averageLeadTime = leadTimes.reduce((sum, time) => sum + time, 0) / leadTimes.length;

      return {
        value: Math.round(averageLeadTime * 100) / 100,
        count: leadTimes.length,
        unit: 'days',
        performanceLevel: this.getLeadTimeLevel(averageLeadTime),
        description: `Average of ${leadTimes.length} completed changes`
      };
    } catch (error) {
      throw new Error(`Failed to calculate lead time: ${error.message}`);
    }
  }

  async calculateMTTR(bugTypeIds, bugCategoryIds, since, until) {
    try {
      if ((!bugTypeIds || bugTypeIds.length === 0) && 
          (!bugCategoryIds || bugCategoryIds.length === 0)) {
        return {
          value: 0,
          unit: 'hours',
          performanceLevel: 'low',
          description: 'No bug types or categories configured'
        };
      }

      const filters = {
        updatedSince: since,
        updatedUntil: until
      };

      if (bugTypeIds && bugTypeIds.length > 0) {
        filters.issueTypeId = bugTypeIds;
      }
      
      if (bugCategoryIds && bugCategoryIds.length > 0) {
        filters.categoryId = bugCategoryIds;
      }

      const issues = await this.backlogApi.getAllIssues(this.project.id, filters);

      const resolvedBugs = issues.filter(issue => 
        issue.status && 
        (issue.status.name.includes('完了') || 
         issue.status.name.includes('解決') || 
         issue.status.name.includes('Resolved') || 
         issue.status.name.includes('Done'))
      );

      if (resolvedBugs.length === 0) {
        return {
          value: 0,
          unit: 'hours',
          performanceLevel: 'low',
          description: 'No resolved bugs found'
        };
      }

      const recoveryTimes = resolvedBugs
        .filter(issue => issue.created && issue.updated)
        .map(issue => {
          const created = moment(issue.created);
          const resolved = moment(issue.updated);
          return resolved.diff(created, 'hours', true);
        })
        .filter(hours => hours >= 0);

      if (recoveryTimes.length === 0) {
        return {
          value: 0,
          unit: 'hours',
          performanceLevel: 'low',
          description: 'No valid recovery times calculated'
        };
      }

      const averageMTTR = recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length;

      return {
        value: Math.round(averageMTTR * 100) / 100,
        count: recoveryTimes.length,
        unit: 'hours',
        performanceLevel: this.getMTTRLevel(averageMTTR),
        description: `Average of ${recoveryTimes.length} resolved bugs`
      };
    } catch (error) {
      throw new Error(`Failed to calculate MTTR: ${error.message}`);
    }
  }

  async calculateChangeFailureRate(changeTypeIds, changeCategoryIds, bugTypeIds, bugCategoryIds, since, until) {
    try {
      if ((!changeTypeIds || changeTypeIds.length === 0) && 
          (!changeCategoryIds || changeCategoryIds.length === 0)) {
        return {
          value: 0,
          unit: '%',
          performanceLevel: 'elite',
          description: 'No change types or categories configured'
        };
      }

      if ((!bugTypeIds || bugTypeIds.length === 0) && 
          (!bugCategoryIds || bugCategoryIds.length === 0)) {
        return {
          value: 0,
          unit: '%',
          performanceLevel: 'elite',
          description: 'No bug types or categories configured'
        };
      }

      const changeFilters = {
        createdSince: since,
        createdUntil: until
      };

      if (changeTypeIds && changeTypeIds.length > 0) {
        changeFilters.issueTypeId = changeTypeIds;
      }
      
      if (changeCategoryIds && changeCategoryIds.length > 0) {
        changeFilters.categoryId = changeCategoryIds;
      }

      const bugFilters = {
        createdSince: since,
        createdUntil: until
      };

      if (bugTypeIds && bugTypeIds.length > 0) {
        bugFilters.issueTypeId = bugTypeIds;
      }
      
      if (bugCategoryIds && bugCategoryIds.length > 0) {
        bugFilters.categoryId = bugCategoryIds;
      }

      const [changes, bugs] = await Promise.all([
        this.backlogApi.getAllIssues(this.project.id, changeFilters),
        this.backlogApi.getAllIssues(this.project.id, bugFilters)
      ]);

      const changeCount = changes.length;
      const bugCount = bugs.length;

      if (changeCount === 0) {
        return {
          value: 0,
          changeCount: 0,
          bugCount: bugCount,
          unit: '%',
          performanceLevel: 'elite',
          description: 'No changes found in the period'
        };
      }

      const failureRate = (bugCount / changeCount) * 100;

      return {
        value: Math.round(failureRate * 100) / 100,
        changeCount,
        bugCount,
        unit: '%',
        performanceLevel: this.getChangeFailureRateLevel(failureRate),
        description: `${bugCount} bugs out of ${changeCount} changes`
      };
    } catch (error) {
      throw new Error(`Failed to calculate change failure rate: ${error.message}`);
    }
  }

  calculatePeriodInDays(since, until) {
    if (!since || !until) {
      return 0;
    }
    
    const start = moment(since);
    const end = moment(until);
    return end.diff(start, 'days', true);
  }

  getDeploymentFrequencyLevel(deploymentsPerDay) {
    if (deploymentsPerDay >= 1) return 'elite';
    if (deploymentsPerDay >= 0.2) return 'high';
    if (deploymentsPerDay >= 0.067) return 'medium';
    return 'low';
  }

  getLeadTimeLevel(days) {
    if (days <= 1) return 'elite';
    if (days <= 7) return 'high';
    if (days <= 30) return 'medium';
    return 'low';
  }

  getMTTRLevel(hours) {
    if (hours <= 1) return 'elite';
    if (hours <= 24) return 'high';
    if (hours <= 168) return 'medium';
    return 'low';
  }

  getChangeFailureRateLevel(percentage) {
    if (percentage <= 5) return 'elite';
    if (percentage <= 10) return 'high';
    if (percentage <= 15) return 'medium';
    return 'low';
  }

  getPerformanceLevelColor(level) {
    const colors = {
      elite: '#22C55E',    // Green
      high: '#3B82F6',     // Blue
      medium: '#F59E0B',   // Orange
      low: '#EF4444'       // Red
    };
    return colors[level] || colors.low;
  }

  getPerformanceLevelDescription(metric, level) {
    const descriptions = {
      deploymentFrequency: {
        elite: 'Multiple deployments per day',
        high: 'Between once per day and once per week',
        medium: 'Between once per week and once per month',
        low: 'Less than once per month'
      },
      leadTime: {
        elite: 'Less than one day',
        high: 'Between one day and one week',
        medium: 'Between one week and one month',
        low: 'More than one month'
      },
      mttr: {
        elite: 'Less than one hour',
        high: 'Less than one day',
        medium: 'Less than one week',
        low: 'More than one week'
      },
      changeFailureRate: {
        elite: '0-5% of changes result in failures',
        high: '5-10% of changes result in failures',
        medium: '10-15% of changes result in failures',
        low: 'More than 15% of changes result in failures'
      }
    };
    
    return descriptions[metric] && descriptions[metric][level] 
      ? descriptions[metric][level] 
      : 'Performance level not available';
  }
}

module.exports = FourKeysMetricsService;