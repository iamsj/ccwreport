// Example usage of the data source management system

import { DataSourceManager } from '../services/data-source-manager';
import { GitDataSource } from '../services/git-data-source';
import { GitDataSourceConfig, TimeRange } from '../models/config';

/**
 * Example demonstrating how to use the data source management system
 */
export async function demonstrateDataSourceUsage() {
  console.log('🚀 Data Source Management System Demo\n');

  // 1. Create a data source manager
  const manager = new DataSourceManager();
  console.log('✅ Created DataSourceManager');

  // 2. Register data sources
  const gitDataSource = GitDataSource.create();
  manager.registerDataSource(gitDataSource);
  console.log('✅ Registered GitDataSource');

  // 3. Create sample configurations
  const gitConfig: GitDataSourceConfig = {
    type: 'git',
    enabled: true,
    name: 'my-project-git',
    description: 'Git commits from my main project',
    repositories: [
      {
        name: 'main-repo',
        path: './my-project',
        branch: 'main',
      },
      {
        name: 'feature-repo',
        path: './feature-branch',
        branch: 'feature/new-feature',
      },
    ],
    username: 'john.doe',
    priority: 1,
    timeout: 30000,
    maxRetries: 3,
  };

  const configs = [gitConfig];

  // 4. Validate configurations
  console.log('\n📋 Validating configurations...');
  const validationResults = manager.validateConfigurations(configs);
  
  validationResults.forEach((result, index) => {
    if (result.isValid) {
      console.log(`✅ Configuration ${index + 1} is valid`);
    } else {
      console.log(`❌ Configuration ${index + 1} has errors:`, result.errors);
    }
  });

  // 5. Test connections (would normally test real repositories)
  console.log('\n🔗 Testing connections...');
  try {
    const connectionResults = await manager.testConnections(configs);
    connectionResults.forEach((result, index) => {
      if (result.success) {
        console.log(`✅ Connection ${index + 1} successful`);
      } else {
        console.log(`❌ Connection ${index + 1} failed:`, result.error?.message || result.message);
      }
    });
  } catch (error) {
    console.log('⚠️  Connection testing skipped (no real repositories available)');
  }

  // 6. Set up time range for data collection
  const timeRange: TimeRange = {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    end: new Date(),
    type: 'weekly',
  };

  console.log(`\n📅 Time range: ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}`);

  // 7. Collect data with progress tracking
  console.log('\n📊 Collecting data...');
  try {
    const result = await manager.collectData(configs, timeRange, {
      concurrent: true,
      maxConcurrency: 2,
      continueOnError: true,
      onProgress: (progress) => {
        console.log(`Progress: ${progress.percentage}% (${progress.completed}/${progress.total} completed, ${progress.failed} failed)`);
        if (progress.current) {
          console.log(`Currently processing: ${progress.current}`);
        }
      },
    });

    // 8. Display results
    console.log('\n📈 Collection Results:');
    console.log(`✅ Successful sources: ${result.summary.successfulSources}`);
    console.log(`❌ Failed sources: ${result.summary.failedSources}`);
    console.log(`📊 Total data points: ${result.summary.totalDataPoints}`);
    console.log(`⏱️  Collection time: ${result.summary.collectionTime}ms`);

    if (result.data.length > 0) {
      console.log('\n📝 Sample data:');
      result.data.forEach((collectedData, index) => {
        console.log(`  Source ${index + 1}: ${collectedData.source}`);
        console.log(`    Data points: ${collectedData.data.length}`);
        if (collectedData.data.length > 0) {
          const firstCommit = collectedData.data[0] as any;
          console.log(`    Sample commit: ${firstCommit.message} by ${firstCommit.author}`);
        }
      });
    }

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      result.errors.forEach((error, index) => {
        console.log(`  Error ${index + 1}: ${error.message}`);
      });
    }

  } catch (error) {
    console.log('⚠️  Data collection skipped (no real repositories available)');
    console.log('   In a real scenario, this would collect actual git commit data');
  }

  // 9. Display manager statistics
  console.log('\n📊 Manager Statistics:');
  const stats = manager.getStatistics();
  console.log(`Total registered sources: ${stats.totalRegistered}`);
  console.log(`Active sources: ${stats.activeCount}`);
  console.log(`Type breakdown:`, stats.typeBreakdown);

  // 10. Demonstrate configuration schema
  console.log('\n📋 Git Data Source Schema:');
  const schema = gitDataSource.getConfigSchema();
  console.log(`Schema version: ${schema.$schema}`);
  console.log(`Required fields: ${schema.required.join(', ')}`);
  console.log(`Supported properties: ${Object.keys(schema.properties).join(', ')}`);

  console.log('\n🎉 Demo completed successfully!');
}

/**
 * Example of creating a custom data source
 */
export class ExampleCustomDataSource {
  readonly type = 'example-custom';
  readonly name = 'Example Custom Data Source';
  readonly version = '1.0.0';

  async collect(config: any, timeRange: TimeRange) {
    // Custom data collection logic would go here
    return {
      source: `${this.type}:${config.name}`,
      timeRange,
      data: [
        {
          id: 'custom-1',
          timestamp: new Date(),
          content: 'Custom data point',
          metadata: { source: 'custom-api' },
        },
      ],
    };
  }

  validate(config: any) {
    // Custom validation logic
    return {
      isValid: true,
      errors: [],
    };
  }

  async testConnection(config: any) {
    // Custom connection testing
    return true;
  }

  getConfigSchema() {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object' as const,
      required: ['type', 'enabled', 'name'],
      properties: {
        type: { type: 'string', const: 'example-custom' },
        enabled: { type: 'boolean' },
        name: { type: 'string' },
        apiUrl: { type: 'string', format: 'uri' },
        apiKey: { type: 'string' },
      },
      additionalProperties: false,
    };
  }
}

/**
 * Example of extending the system with a custom data source
 */
export async function demonstrateCustomDataSource() {
  console.log('\n🔧 Custom Data Source Demo\n');

  const manager = new DataSourceManager();
  const customSource = new ExampleCustomDataSource();
  
  // Register the custom data source
  manager.registerDataSource(customSource);
  console.log('✅ Registered custom data source');

  // Create configuration for custom source
  const customConfig = {
    type: 'example-custom',
    enabled: true,
    name: 'my-custom-source',
    apiUrl: 'https://api.example.com/data',
    apiKey: 'secret-key',
  };

  // Validate and use the custom source
  const validation = manager.validateConfigurations([customConfig]);
  console.log('✅ Custom configuration validated:', validation[0].isValid);

  const timeRange: TimeRange = {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
    end: new Date(),
    type: 'daily',
  };

  try {
    const result = await manager.collectData([customConfig], timeRange);
    console.log('✅ Custom data collected:', result.data.length, 'data points');
  } catch (error) {
    console.log('⚠️  Custom data collection demo (would work with real implementation)');
  }

  console.log('🎉 Custom data source demo completed!');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateDataSourceUsage()
    .then(() => demonstrateCustomDataSource())
    .catch(console.error);
}